const { getPool } = require('./_db');
const { requireRole, hashPassword, json } = require('./_auth');

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

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!name || !email || !password) {
    return json(400, { error: 'Faltan nombre, email o contraseña' });
  }
  if (password.length < 8) {
    return json(400, { error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const pool = getPool();

  const existing = await pool.query('SELECT id FROM vendors WHERE email = $1', [email]);
  if (existing.rows.length) {
    return json(409, { error: 'Ya existe un vendedor con ese email' });
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO vendors (name, email, password_hash, active)
     VALUES ($1, $2, $3, true)
     RETURNING id, name, email, active, created_at`,
    [name, email, passwordHash]
  );

  return json(200, { ok: true, vendor: rows[0] });
};
