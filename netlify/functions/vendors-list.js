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

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT v.id, v.name, v.email, v.active, v.created_at,
            COUNT(q.id) AS quotes_count
     FROM vendors v
     LEFT JOIN quotes q ON q.vendor_id = v.id
     GROUP BY v.id
     ORDER BY v.created_at DESC`
  );

  return json(200, { vendors: rows });
};
