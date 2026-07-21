# SEGTEC — Herramienta comercial interna

Login de vendedores + comparador/presupuestador + panel de administración
(alta y baja de vendedores, ver todos los presupuestos emitidos).

## Qué incluye

```
netlify.toml              → config de Netlify (rutas /api/* y carpeta publish)
package.json               → dependencias (pg, bcryptjs, jsonwebtoken)
schema.sql                  → esquema de la base de datos (Postgres)
scripts/seed-admin.js       → crea tu primer usuario administrador
netlify/functions/          → todo el backend (login, presupuestos, vendedores)
public/
  login.html                 → login de vendedores
  admin.html                  → login admin + panel (alta/baja vendedores, presupuestos)
  app.html                    → tu herramienta de comparación y presupuestos (ya conectada)
tests/run_tests.js         → batería de pruebas del backend (ya corrida y verificada)
```

## Paso 1 — Crear el sitio en Netlify

1. Subí esta carpeta a un repositorio de GitHub (o usá `netlify deploy` desde la CLI).
2. En Netlify: **Add new site → Import an existing project** y conectá el repo.
3. Build settings: dejá **Publish directory = `public`** y **Functions directory = `netlify/functions`**
   (ya vienen seteados en `netlify.toml`, no deberías tener que tocarlos).

## Paso 2 — Activar Netlify DB (Postgres)

1. En el dashboard del sitio: **Extensions → Netlify DB** (o **Integrations**) → activarla.
2. Esto crea automáticamente la variable de entorno `NETLIFY_DATABASE_URL` — no hace falta que la cargues vos.

## Paso 3 — Configurar las variables de entorno

En **Site configuration → Environment variables**, agregá:

| Variable | Valor |
|---|---|
| `JWT_SECRET` | Una clave larga y secreta, por ejemplo generada con `openssl rand -hex 32` |

`NETLIFY_DATABASE_URL` ya la puso Netlify solo en el paso anterior.

## Paso 4 — Cargar el esquema de la base

Con la CLI de Netlify conectada al sitio (`netlify link`), corré:

```bash
netlify env:get NETLIFY_DATABASE_URL
```

Copiá esa URL y aplicá el esquema:

```bash
psql "LA_URL_QUE_TE_DIO_NETLIFY" -f schema.sql
```

(Si no tenés `psql` instalado, cualquier cliente de Postgres —TablePlus, DBeaver, pgAdmin— sirve igual: solo necesitás correr el contenido de `schema.sql` una vez).

## Paso 5 — Crear tu usuario administrador

En tu máquina, con Node instalado:

```bash
npm install
export DATABASE_URL="LA_URL_QUE_TE_DIO_NETLIFY"
npm run seed-admin -- "Rafa" "rafa@segtec.com.ar" "tu-contraseña-segura"
```

Esto crea (o actualiza la contraseña de) tu usuario admin. Repetí este paso
cada vez que quieras cambiar tu propia contraseña — es seguro correrlo de nuevo.

## Paso 6 — Deploy

```bash
git push
```

(o `netlify deploy --prod` si preferís la CLI). Netlify instala las dependencias
del `package.json` automáticamente y despliega las funciones.

## Paso 7 — Probar

- **`https://tu-dominio/login.html`** — acá entran los vendedores
- **`https://tu-dominio/admin.html`** — acá entrás vos, con el usuario que creaste en el Paso 5
- Desde el panel admin, dado de alta un vendedor de prueba, logueate en `login.html` con ese
  vendedor, armá un presupuesto y descargá el PDF — después volvé al panel admin, pestaña
  "Presupuestos", y verificá que aparezca.

## Dominio propio

Una vez andando en `tu-sitio.netlify.app`, andá a **Domain management** y agregá
`interno.segtec.com.ar` (o el que hayas elegido) como dominio personalizado. Netlify
te da los registros DNS exactos para cargar en tu proveedor de dominio.

## Cómo se guardan las contraseñas

Nunca en texto plano — se guardan hasheadas con bcrypt en la base. Ni vos ni nadie
con acceso a la base puede "leer" la contraseña de un vendedor, solo verificar si
una que se ingresa coincide.

## Si algo falla

- **"Falta configurar NETLIFY_DATABASE_URL"** → no activaste la extensión Netlify DB
  o no se propagó todavía; esperá un minuto y volvé a intentar el deploy.
- **"Falta configurar JWT_SECRET"** → cargala en el Paso 3, después hacé un nuevo deploy
  (las variables de entorno solo se aplican en el próximo build).
- **Login funciona pero no entra a la app** → revisá que las cookies no estén bloqueadas
  por el navegador (algunos navegadores en modo incógnito las bloquean entre subdominios).
