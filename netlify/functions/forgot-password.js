const { getPool } = require('./_db');
const { generateToken, json } = require('./_auth');
const { sendVendorResetEmail } = require('./_email_vendor_reset');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Cuerpo inválido' }); }

  const email = (body.email || '').trim().toLowerCase();
  if (!email) return json(400, { error: 'Falta el email' });

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, email FROM vendors WHERE email = $1 AND active = true',
    [email]
  );

  // Respuesta siempre igual, exista o no la cuenta / esté bloqueada o no:
  // evita que este formulario sirva para averiguar qué emails están dados de alta.
  const genericResponse = { ok: true, message: 'Si el email corresponde a un vendedor activo, te enviamos un link para restablecer tu contraseña.' };

  if (!rows.length) return json(200, genericResponse);

  const vendor = rows[0];
  const token = generateToken();
  await pool.query(
    `INSERT INTO vendor_reset_tokens (vendor_id, token, expires_at)
     VALUES ($1, $2, now() + interval '1 hour')`,
    [vendor.id, token]
  );
  await sendVendorResetEmail(vendor, token);

  return json(200, genericResponse);
};
