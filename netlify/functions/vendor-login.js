const { getPool } = require('./_db');
const { verifyPassword, setSessionCookieHeader, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Cuerpo inválido' });
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!email || !password) {
    return json(400, { error: 'Faltan email o contraseña' });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, email, password_hash, active FROM vendors WHERE email = $1',
    [email]
  );

  const vendor = rows[0];
  if (!vendor || !vendor.active) {
    return json(401, { error: 'Usuario o contraseña incorrectos' });
  }

  const ok = await verifyPassword(password, vendor.password_hash);
  if (!ok) {
    return json(401, { error: 'Usuario o contraseña incorrectos' });
  }

  const cookieHeader = setSessionCookieHeader({
    role: 'vendor',
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
  });

  return json(200, { ok: true, name: vendor.name }, { 'Set-Cookie': cookieHeader });
};
