const { getPool } = require('./_db');
const { hashPassword, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Cuerpo inválido' }); }

  const token = (body.token || '').trim();
  const password = body.password || '';

  if (!token) return json(400, { error: 'Falta el token' });
  if (password.length < 8) return json(400, { error: 'La contraseña debe tener al menos 8 caracteres' });

  const pool = getPool();

  // Limpieza best-effort de tokens vencidos
  await pool.query(`DELETE FROM vendor_reset_tokens WHERE expires_at < now()`);

  const { rows } = await pool.query(
    `SELECT vendor_id FROM vendor_reset_tokens WHERE token = $1 AND expires_at > now()`,
    [token]
  );
  if (!rows.length) {
    return json(400, { error: 'El link venció o ya fue usado. Pedí uno nuevo desde "Olvidé mi contraseña".' });
  }

  const vendorId = rows[0].vendor_id;
  const passwordHash = await hashPassword(password);

  await pool.query('UPDATE vendors SET password_hash = $1 WHERE id = $2', [passwordHash, vendorId]);
  await pool.query('DELETE FROM vendor_reset_tokens WHERE vendor_id = $1', [vendorId]);

  return json(200, { ok: true, message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
};
