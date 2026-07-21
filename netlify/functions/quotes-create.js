const { getPool } = require('./_db');
const { requireRole, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido' });
  }

  const session = requireRole(event, 'vendor');
  if (!session) {
    return json(401, { error: 'No autenticado' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Cuerpo inválido' });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return json(400, { error: 'El presupuesto no tiene productos' });
  }

  const clientName = (body.client_name || '').trim();
  const clientCompany = (body.client_company || '').trim();
  const total = Number(body.total) || 0;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const quoteResult = await client.query(
      `INSERT INTO quotes (vendor_id, client_name, client_company, total)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [session.id, clientName, clientCompany, total]
    );
    const quoteId = quoteResult.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO quote_items
           (quote_id, codigo, descripcion, marca, cantidad, descuento_pct, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          quoteId,
          item.codigo || '',
          item.descripcion || '',
          item.marca || '',
          Number(item.cantidad) || 1,
          Number(item.descuento_pct) || 0,
          Number(item.precio_unitario) || 0,
          Number(item.subtotal) || 0,
        ]
      );
    }

    await client.query('COMMIT');
    return json(200, { ok: true, id: quoteId, created_at: quoteResult.rows[0].created_at });
  } catch (e) {
    await client.query('ROLLBACK');
    return json(500, { error: 'No se pudo guardar el presupuesto', detail: e.message });
  } finally {
    client.release();
  }
};
