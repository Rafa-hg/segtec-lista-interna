process.env.DATABASE_URL = 'postgres://postgres:localtest123@localhost:5432/segtec_interna';
process.env.JWT_SECRET = 'local-test-secret-not-for-prod';

function mockEvent({ method = 'GET', body = null, cookieHeader = '', query = {} }) {
  return {
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    queryStringParameters: query,
  };
}

function extractCookie(setCookieHeader) {
  const firstPair = setCookieHeader.split(';')[0];
  return firstPair;
}

async function main() {
  const results = [];
  const assert = (name, cond, extra) => {
    results.push({ name, ok: !!cond, extra });
    console.log((cond ? 'OK  ' : 'FAIL') + '  ' + name + (extra ? '  -> ' + JSON.stringify(extra) : ''));
  };

  // 1. Admin login
  const adminLogin = require('../netlify/functions/admin-login');
  const r1 = await adminLogin.handler(mockEvent({
    method: 'POST',
    body: { email: 'rafa@segtec.com.ar', password: 'testpassword123' },
  }));
  assert('admin login ok', r1.statusCode === 200, JSON.parse(r1.body));
  const adminCookie = extractCookie(r1.headers['Set-Cookie']);

  // 1b. Admin login con contraseña mala
  const r1b = await adminLogin.handler(mockEvent({
    method: 'POST',
    body: { email: 'rafa@segtec.com.ar', password: 'incorrecta' },
  }));
  assert('admin login rechaza contraseña incorrecta', r1b.statusCode === 401);

  // 2. Crear vendedor
  const vendorsCreate = require('../netlify/functions/vendors-create');
  const r2 = await vendorsCreate.handler(mockEvent({
    method: 'POST',
    cookieHeader: adminCookie,
    body: { name: 'Federico', email: 'federico@segtec.com.ar', password: 'ventas2025segura' },
  }));
  assert('crear vendedor ok', r2.statusCode === 200, JSON.parse(r2.body));
  const vendorId = JSON.parse(r2.body).vendor.id;

  // 2b. Crear vendedor duplicado debe fallar
  const r2b = await vendorsCreate.handler(mockEvent({
    method: 'POST',
    cookieHeader: adminCookie,
    body: { name: 'Federico 2', email: 'federico@segtec.com.ar', password: 'otraclave123' },
  }));
  assert('rechaza vendedor duplicado', r2b.statusCode === 409);

  // 2c. Un vendedor NO debería poder crear vendedores (requiere admin)
  const r2c = await vendorsCreate.handler(mockEvent({
    method: 'POST',
    cookieHeader: '',
    body: { name: 'Hacker', email: 'hacker@x.com', password: 'aaaaaaaaaaa' },
  }));
  assert('rechaza creación de vendedor sin sesión admin', r2c.statusCode === 401);

  // 3. Login del vendedor recién creado
  const vendorLogin = require('../netlify/functions/vendor-login');
  const r3 = await vendorLogin.handler(mockEvent({
    method: 'POST',
    body: { email: 'federico@segtec.com.ar', password: 'ventas2025segura' },
  }));
  assert('login vendedor ok', r3.statusCode === 200, JSON.parse(r3.body));
  const vendorCookie = extractCookie(r3.headers['Set-Cookie']);

  // 4. Vendedor genera un presupuesto
  const quotesCreate = require('../netlify/functions/quotes-create');
  const r4 = await quotesCreate.handler(mockEvent({
    method: 'POST',
    cookieHeader: vendorCookie,
    body: {
      client_name: 'Juan Pérez',
      client_company: 'Consorcio Los Alamos',
      total: 459736,
      items: [
        { codigo: 'E02138301', descripcion: 'CONJ. DZ HUB 300', marca: 'PPA', cantidad: 3, descuento_pct: 38, precio_unitario: 96589, subtotal: 289766 },
        { codigo: 'K-15583-EX', descripcion: 'CJ AUT CORR. DZ ATTO', marca: 'ROSSI', cantidad: 1, descuento_pct: 0, precio_unitario: 169970, subtotal: 169970 },
      ],
    },
  }));
  assert('crear presupuesto ok', r4.statusCode === 200, JSON.parse(r4.body));

  // 4b. Un vendedor desactivado no debería poder loguearse (probamos dar de baja)
  const vendorsToggle = require('../netlify/functions/vendors-toggle');
  const r5 = await vendorsToggle.handler(mockEvent({
    method: 'POST',
    cookieHeader: adminCookie,
    body: { id: vendorId, active: false },
  }));
  assert('dar de baja vendedor ok', r5.statusCode === 200, JSON.parse(r5.body));

  const r5b = await vendorLogin.handler(mockEvent({
    method: 'POST',
    body: { email: 'federico@segtec.com.ar', password: 'ventas2025segura' },
  }));
  assert('vendedor dado de baja no puede loguearse', r5b.statusCode === 401);

  // reactivar para seguir probando
  await vendorsToggle.handler(mockEvent({
    method: 'POST',
    cookieHeader: adminCookie,
    body: { id: vendorId, active: true },
  }));

  // 5. Admin lista presupuestos
  const quotesList = require('../netlify/functions/quotes-list');
  const r6 = await quotesList.handler(mockEvent({
    method: 'GET',
    cookieHeader: adminCookie,
    query: {},
  }));
  const listBody = JSON.parse(r6.body);
  assert('listar presupuestos ok', r6.statusCode === 200 && listBody.quotes.length >= 1, { count: listBody.quotes.length });

  // 5b. Filtrar por vendedor
  const r6b = await quotesList.handler(mockEvent({
    method: 'GET',
    cookieHeader: adminCookie,
    query: { vendor_id: String(vendorId) },
  }));
  const listBodyFiltered = JSON.parse(r6b.body);
  assert('filtrar presupuestos por vendedor ok', listBodyFiltered.quotes.every(q => q.vendor_id === vendorId));

  // 5c. Un vendedor NO puede ver el listado de presupuestos (solo admin)
  const r6c = await quotesList.handler(mockEvent({
    method: 'GET',
    cookieHeader: vendorCookie,
    query: {},
  }));
  assert('rechaza listado de presupuestos a un vendedor', r6c.statusCode === 401);

  // 6. Detalle de un presupuesto puntual
  const quoteId = listBody.quotes[0].id;
  const r7 = await quotesList.handler(mockEvent({
    method: 'GET',
    cookieHeader: adminCookie,
    query: { id: String(quoteId) },
  }));
  const detailBody = JSON.parse(r7.body);
  assert('detalle de presupuesto trae items', r7.statusCode === 200 && detailBody.items.length === 2, { items: detailBody.items.length });

  // 7. Listar vendedores
  const vendorsList = require('../netlify/functions/vendors-list');
  const r8 = await vendorsList.handler(mockEvent({ method: 'GET', cookieHeader: adminCookie }));
  const vendorsBody = JSON.parse(r8.body);
  assert('listar vendedores ok', r8.statusCode === 200 && vendorsBody.vendors.length >= 1, { count: vendorsBody.vendors.length });

  // 8. me.js con sesión vendedor
  const me = require('../netlify/functions/me');
  const r9 = await me.handler(mockEvent({ method: 'GET', cookieHeader: vendorCookie }));
  assert('me devuelve rol vendor', r9.statusCode === 200 && JSON.parse(r9.body).role === 'vendor');

  // 9. logout limpia cookie
  const logout = require('../netlify/functions/logout');
  const r10 = await logout.handler(mockEvent({ method: 'GET' }));
  assert('logout responde ok', r10.statusCode === 200);

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (failed.length === 0 ? `TODOS LOS TESTS PASARON (${results.length})` : `${failed.length} TESTS FALLARON de ${results.length}`));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
