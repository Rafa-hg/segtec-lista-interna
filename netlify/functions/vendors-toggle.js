const { getPool } = require('./_db');
const { requireRole, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido' });
  }

  const session = requireRole(event, 'admin');
  if (!session) {
    return json(401, { error: 'No autenticado' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Cuerpo inválido' });
  }

  const id = Number(body.id);
  const active = Boolean(body.active);

  if (!id) {
    return json(400, { error: 'Falta el id del vendedor' });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE vendors SET active = $1 WHERE id = $2 RETURNING id, name, email, active`,
    [active, id]
  );

  if (!rows.length) {
    return json(404, { error: 'Vendedor no encontrado' });
  }

  return json(200, { ok: true, vendor: rows[0] });
};
