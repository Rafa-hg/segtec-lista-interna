const { getPool } = require('./_db');
const { requireRole } = require('./_auth');

const VALID_SHEETS = ['CORREDIZOS', 'LEVADIZOS', 'PIVOTANTES', 'ACCESORIOS', 'SERVICIOS'];

exports.handler = async (event) => {
  // No-store: evita que quede cacheada una versión vieja del catálogo y
  // termine mostrando precios desactualizados (o loopeando con el login).
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  const session = requireRole(event, 'vendor'); // admin también tiene rol vendor implícito en la sesión, o agregar 'admin' si corresponde
  if (!session) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autenticado' }) };
  }

  const sheet = (event.queryStringParameters || {}).sheet;
  if (!sheet || !VALID_SHEETS.includes(sheet)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parámetro "sheet" inválido. Usar uno de: ' + VALID_SHEETS.join(', ') }) };
  }

  const pool = getPool();
  const { rows } = await pool.query('SELECT data FROM catalog_data WHERE sheet_name = $1', [sheet]);

  const data = rows.length ? rows[0].data : [];
  return { statusCode: 200, headers, body: JSON.stringify(data) };
};
