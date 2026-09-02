-- Ejecutar en la base de segtec-interna (Neon / Postgres)

-- 1) Bloqueo de vendedores (no elimina nada, solo impide login)
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2) Tokens de recuperación de contraseña para vendedores
CREATE TABLE IF NOT EXISTS vendor_reset_tokens (
  id          bigserial PRIMARY KEY,
  vendor_id   integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendor_reset_tokens_token ON vendor_reset_tokens(token);

-- 3) Catálogo parseado, una fila por hoja (evita respuestas >6MB en /api/catalog)
CREATE TABLE IF NOT EXISTS catalog_data (
  sheet_name  text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  integer -- id del admin que subió el archivo
);

-- 4) Si la tabla catalog_upload_chunks todavía no existe en interna (viene de público),
--    crearla con el mismo esquema:
CREATE TABLE IF NOT EXISTS catalog_upload_chunks (
  upload_id    text NOT NULL,
  chunk_index  integer NOT NULL,
  chunk_data   text NOT NULL,
  filename     text,
  uploaded_by  integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_id, chunk_index)
);
