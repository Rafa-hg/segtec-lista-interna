const { getPool } = require('./_db');
const { requireRole, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Método no permitido' });
  }

  const session = requireRole(event, 'admin');
  if (!session) {
    return json(401, { error: 'No autenticado' });
  }

  const params = event.queryStringParameters || {};
  const conditions = [];
  const values = [];
  let idx = 1;

  if (params.vendor_id) {
    conditions.push(`q.vendor_id = $${idx++}`);
    values.push(Number(params.vendor_id));
  }
  if (params.date_from) {
    conditions.push(`q.created_at >= $${idx++}`);
    values.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push(`q.created_at <= $${idx++}`);
    values.push(params.date_to + ' 23:59:59');
  }
  if (params.q) {
    conditions.push(`(q.client_name ILIKE $${idx} OR q.client_company ILIKE $${idx})`);
    values.push(`%${params.q}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const pool = getPool();

  if (params.id) {
    const detail = await pool.query(
      `SELECT q.id, q.client_name, q.client_company, q.total, q.created_at,
              v.name AS vendor_name, v.email AS vendor_email
       FROM quotes q JOIN vendors v ON v.id = q.vendor_id
       WHERE q.id = $1`,
      [Number(params.id)]
    );
    if (!detail.rows.length) return json(404, { error: 'No encontrado' });

    const items = await pool.query(
      `SELECT codigo, descripcion, marca, cantidad, descuento_pct, precio_unitario, subtotal
       FROM quote_items WHERE quote_id = $1 ORDER BY id`,
      [Number(params.id)]
    );

    return json(200, { quote: detail.rows[0], items: items.rows });
  }

  const { rows } = await pool.query(
    `SELECT q.id, q.client_name, q.client_company, q.total, q.created_at,
            v.name AS vendor_name, v.id AS vendor_id
     FROM quotes q JOIN vendors v ON v.id = q.vendor_id
     ${where}
     ORDER BY q.created_at DESC
     LIMIT 500`,
    values
  );

  return json(200, { quotes: rows });
};
