const { getPool } = require('./_db');
const { requireRole, generateToken, json } = require('./_auth');
const { sendVendorResetEmail } = require('./_email_vendor_reset');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  const session = requireRole(event, 'admin');
  if (!session) return json(401, { error: 'No autenticado' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Cuerpo inválido' }); }

  const { vendorId } = body;
  if (!vendorId) return json(400, { error: 'Falta vendorId' });

  const pool = getPool();
  const { rows } = await pool.query('SELECT id, name, email FROM vendors WHERE id = $1', [vendorId]);
  if (!rows.length) return json(404, { error: 'Vendedor no encontrado' });

  const vendor = rows[0];
  const token = generateToken();
  await pool.query(
    `INSERT INTO vendor_reset_tokens (vendor_id, token, expires_at)
     VALUES ($1, $2, now() + interval '1 hour')`,
    [vendor.id, token]
  );
  await sendVendorResetEmail(vendor, token);

  return json(200, { ok: true, message: 'Mail de recuperación enviado a ' + vendor.email });
};
