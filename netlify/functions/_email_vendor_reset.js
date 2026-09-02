const nodemailer = require('nodemailer');

// Reutiliza las mismas variables de entorno que ya tenés configuradas para
// pública (Google Workspace SMTP + App Password de 16 caracteres).
// Si ya existe un _email.js común en el proyecto, lo más prolijo es mover
// esta función ahí y eliminar este archivo.
function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // App Password de Google Workspace, no la contraseña normal
    },
  });
}

async function sendVendorResetEmail(vendor, token) {
  const baseUrl = process.env.INTERNA_BASE_URL || 'https://listainterna.segtec.com.ar';
  const link = `${baseUrl}/reset-password.html?token=${encodeURIComponent(token)}`;

  const transport = getTransport();
  await transport.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: vendor.email,
    subject: 'SEGTEC — Recuperar contraseña',
    html: `
      <p>Hola ${vendor.name || ''},</p>
      <p>Pediste restablecer tu contraseña de la herramienta comercial interna de SEGTEC.</p>
      <p><a href="${link}">Hacé clic acá para elegir una nueva contraseña</a></p>
      <p>Este link vence en 1 hora. Si no lo pediste vos, ignorá este mail.</p>
    `,
  });
}

module.exports = { sendVendorResetEmail };
