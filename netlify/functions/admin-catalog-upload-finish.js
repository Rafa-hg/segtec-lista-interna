const { getPool } = require('./_db');
const { requireRole, json } = require('./_auth');
const { parseCatalogXlsxInterna } = require('./_xlsx_parser_interna');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  const session = requireRole(event, 'admin');
  if (!session) return json(401, { error: 'No autenticado' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Cuerpo inválido' }); }

  const { uploadId } = body;
  if (!uploadId) return json(400, { error: 'Falta uploadId' });

  const pool = getPool();

  const { rows: chunks } = await pool.query(
    `SELECT chunk_index, chunk_data FROM catalog_upload_chunks
     WHERE upload_id = $1 ORDER BY chunk_index ASC`,
    [uploadId]
  );
  if (!chunks.length) return json(400, { error: 'No se encontraron partes para este upload. Volvé a intentar la subida.' });

  // Importante: las partes son fragmentos de un mismo texto en base64. Si se
  // decodifica cada parte por separado, un corte que no caiga en un múltiplo
  // de 4 caracteres corrompe el archivo. Por eso se concatenan los TEXTOS
  // primero y se decodifica una sola vez al final.
  const base64Full = chunks.map((c) => c.chunk_data).join('');
  const buffer = Buffer.from(base64Full, 'base64');

  let catalog, stats;
  try {
    ({ catalog, stats } = await parseCatalogXlsxInterna(buffer));
  } catch (e) {
    return json(500, { error: 'No se pudo leer el archivo. Verificá que sea un .xlsx válido con el formato esperado.', detail: String(e && e.message || e) });
  }

  // Se guarda una fila por hoja para poder servir /api/catalog?sheet=X sin
  // superar el límite de respuesta de Netlify Functions (~6MB) al traer todo junto.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [sheet, items] of Object.entries(catalog)) {
      await client.query(
        `INSERT INTO catalog_data (sheet_name, data, updated_at, updated_by)
         VALUES ($1, $2::jsonb, now(), $3)
         ON CONFLICT (sheet_name) DO UPDATE SET data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [sheet, JSON.stringify(items), session.id]
      );
    }
    await client.query('DELETE FROM catalog_upload_chunks WHERE upload_id = $1', [uploadId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return json(200, { ok: true, stats });
};
