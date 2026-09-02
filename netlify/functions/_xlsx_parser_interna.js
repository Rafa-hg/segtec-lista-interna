const ExcelJS = require('exceljs');
const { Jimp } = require('jimp');

// ── Config por hoja de PRODUCTOS (CORREDIZOS / LEVADIZOS / PIVOTANTES / ACCESORIOS) ──
// El archivo interna tiene, además de los datos del producto, un bloque de
// "BENCHMARK" (competencia) a la derecha, separado por una columna en blanco
// y marcado con el texto "BENCHMARK" en la fila 2. Detectamos ese bloque por
// posición (no por texto de columna, porque "MARCA"/"GREMIO" se repiten en
// ambos bloques).
const HEADER_ROW = 3;
const BAND_ROW_TAG = '▌';
const OVERFLOW_THRESHOLD_EMU = 400000;
const IMG_MAX_WIDTH = 220;

const MAIN_ALIASES = {
  marca: ['MARCA', 'CATEGORIA'], // ACCESORIOS usa "CATEGORÍA" pero el dato es la marca
  codigo: ['CODIGO'],
  desc: ['DESCRIPCION'],
  tec: ['TECNOLOGIA'],
  peso: ['PESO'],
  vel: ['VEL'],
  pv_min: ['PV MIN'],
  desc_max: ['DESC MAX'],
  iva: ['IVA'],
  gremio_ref: ['GREMIO'],
  ml_ars: ['PRECIO ML'],
  stock: ['STOCK'],
};

// Alias del bloque BENCHMARK (columnas a la derecha del separador en blanco)
const BM_ALIASES = {
  bm_marca: ['MARCA'],
  bm_modelo: ['MODELO'],
  bm_gremio: ['GREMIO'], // se toma la ÚLTIMA coincidencia (evita "GREMIO U$")
  bm_precio: ['MERCADO LIBRE'],
};

const SHEET_KEYS = {
  CORREDIZOS: ['marca', 'codigo', 'desc', 'pv_min', 'desc_max', 'iva', 'gremio_ref', 'ml_ars'],
  LEVADIZOS: ['marca', 'codigo', 'desc', 'pv_min', 'desc_max', 'iva', 'gremio_ref', 'ml_ars'],
  PIVOTANTES: ['marca', 'codigo', 'desc', 'pv_min', 'desc_max', 'iva', 'gremio_ref', 'ml_ars'],
  ACCESORIOS: ['marca', 'codigo', 'desc', 'pv_min', 'desc_max', 'iva', 'gremio_ref', 'ml_ars'],
};

// Pares de productos que comparten foto por decisión de SEGTEC (uno de los dos
// no tiene fotografía propia en el archivo).
const SHARED_PHOTO_PAIRS = [
  { from: 'P05186', to: 'F05180' },
  { from: 'E01100301', to: 'E01100300' },
];

// ExcelJS no tiene modo "data_only" como openpyxl: una celda con fórmula
// devuelve un objeto { formula, result } en vez del valor simple. Si no
// extraemos ".result" quedan objetos crudos guardados como precio.
function getCellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if ('result' in v) return v.result === undefined ? null : v.result;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if (v instanceof Date) return v;
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}

const normalizeHeader = (v) => {
  if (v === null || v === undefined) return '';
  return String(v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

/**
 * Detecta el punto en que arranca el bloque BENCHMARK buscando el texto
 * "BENCHMARK" en la fila 2. Si no existe (p.ej. PIVOTANTES), no hay bloque.
 */
function findBenchmarkStartCol(ws) {
  const row2 = ws.getRow(2);
  for (let c = 1; c <= ws.columnCount; c++) {
    if (normalizeHeader(row2.getCell(c).value).includes('BENCHMARK')) return c;
  }
  return null;
}

function detectColumnsProducto(ws, sheetName) {
  const row = ws.getRow(HEADER_ROW);
  const headerTexts = [];
  for (let c = 1; c <= ws.columnCount; c++) headerTexts.push(normalizeHeader(row.getCell(c).value));

  const bmStart = findBenchmarkStartCol(ws);
  const mainRange = bmStart ? [1, bmStart - 1] : [1, headerTexts.length];

  // Dado un índice de columna (1-indexado) que matcheó un alias, si el
  // encabezado combinado se repite en la(s) columna(s) siguiente(s)
  // (propagación de ExcelJS en celdas combinadas), el dato real del
  // producto vive en la ÚLTIMA columna de ese combinado.
  const extendToLastMerged = (c) => {
    const text = headerTexts[c - 1];
    let last = c;
    while (last < headerTexts.length && headerTexts[last] === text) last++;
    return last; // headerTexts[last-1] sigue siendo 0-indexado -> columna "last" 1-indexada
  };

  const cols = {};

  // Bloque principal: primera coincidencia de izquierda a derecha, extendida
  // a la última columna del combinado.
  for (const [key, aliases] of Object.entries(MAIN_ALIASES)) {
    for (let c = mainRange[0]; c <= mainRange[1]; c++) {
      const text = headerTexts[c - 1];
      if (text && aliases.some((a) => text.includes(a))) { cols[key] = extendToLastMerged(c); break; }
    }
  }

  // "accion" (cremallera / tamaño accionador / ancho hoja) no tiene un nombre
  // fijo entre hojas: es siempre la columna entre "VEL." y "PV MÍN".
  if (cols.vel && cols.pv_min && cols.pv_min - cols.vel === 2) {
    cols.accion = cols.vel + 1;
  }

  // Bloque BENCHMARK: mismo criterio, pero "bm_gremio" toma la ÚLTIMA
  // coincidencia (así ignora "GREMIO U$" cuando también existe "GREMIO $").
  if (bmStart) {
    for (const [key, aliases] of Object.entries(BM_ALIASES)) {
      let found = null;
      for (let c = bmStart; c <= headerTexts.length; c++) {
        const text = headerTexts[c - 1];
        if (text && aliases.some((a) => text.includes(a))) found = extendToLastMerged(c);
        if (found && key !== 'bm_gremio') break; // primera coincidencia, salvo bm_gremio
      }
      if (found) cols[key] = found;
    }
  }

  const expected = SHEET_KEYS[sheetName] || [];
  const missing = expected.filter((k) => !cols[k]);
  if (missing.length) cols.__missing = missing;
  return cols;
}

async function resizeImageToBase64(buffer) {
  try {
    const img = await Jimp.read(buffer);
    if (img.width > IMG_MAX_WIDTH) img.resize({ w: IMG_MAX_WIDTH });
    const b64 = await img.getBase64('image/png');
    return b64.replace(/^data:image\/png;base64,/, '');
  } catch (e) {
    return null;
  }
}

function buildImageMap(ws, productRowsSet, mediaList) {
  const byRow = new Map();
  ws.getImages().forEach((imgRef) => {
    const row = imgRef.range.tl.nativeRow + 1;
    const rowOff = imgRef.range.tl.nativeRowOff;
    const media = mediaList[imgRef.imageId];
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push({ rowOff, buffer: media.buffer });
  });

  const normal = new Map();
  const overflow = [];
  [...byRow.keys()].sort((a, b) => a - b).forEach((row) => {
    const items = byRow.get(row).sort((a, b) => a.rowOff - b.rowOff);
    normal.set(row, items[0].buffer);
    items.slice(1).forEach((it) => { if (it.rowOff > OVERFLOW_THRESHOLD_EMU) overflow.push([row, it.buffer]); });
  });

  const result = new Map();
  let oi = 0;
  [...productRowsSet].sort((a, b) => a - b).forEach((pr) => {
    if (normal.has(pr)) result.set(pr, normal.get(pr));
    else if (oi < overflow.length && overflow[oi][0] <= pr) { result.set(pr, overflow[oi][1]); oi++; }
  });
  return result;
}

function isSectionRow(row) {
  const aVal = row.getCell(1).value;
  const bVal = row.getCell(2).value;
  const text = [aVal, bVal].find((v) => typeof v === 'string' && v.includes(BAND_ROW_TAG));
  return text || null;
}

async function parseProductSheet(ws, sheetName, stats) {
  const cols = detectColumnsProducto(ws, sheetName);
  if (!cols.codigo) {
    stats[sheetName] = { error: 'No se encontró la columna "CÓDIGO" en la fila de encabezados (fila 3)' };
    return [];
  }

  const productRows = [];
  for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.hidden) continue;
    if (isSectionRow(row)) continue;
    const codeVal = getCellValue(row.getCell(cols.codigo));
    if (codeVal && normalizeHeader(codeVal) !== 'CODIGO') productRows.push(r);
  }

  const imgMap = buildImageMap(ws, new Set(productRows), ws.workbook.model.media);

  const rowsOut = [];
  for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.hidden) continue;
    const sectionText = isSectionRow(row);
    if (sectionText) { rowsOut.push({ type: 'section', seg: sectionText.replace(/▌/g, '').trim() }); continue; }
    const codeVal = getCellValue(row.getCell(cols.codigo));
    if (!codeVal || normalizeHeader(codeVal) === 'CODIGO') continue;

    const item = { type: 'product' };
    for (const [key, colNum] of Object.entries(cols)) {
      if (key === '__missing') continue;
      item[key] = getCellValue(row.getCell(colNum));
    }
    if (imgMap.has(r)) {
      const b64 = await resizeImageToBase64(imgMap.get(r));
      if (b64) item.img = b64;
    }
    rowsOut.push(item);
  }

  if (cols.__missing) stats[sheetName] = { columnasNoEncontradas: cols.__missing, productos: rowsOut.filter(x=>x.type==='product').length };
  else stats[sheetName] = { productos: rowsOut.filter(x=>x.type==='product').length, conImagen: rowsOut.filter(x=>x.type==='product' && x.img).length };

  return rowsOut;
}

// ── Hoja SERVICIOS ──
// Formato plano (una sola fila de encabezado, sin celdas combinadas):
// CATEGORÍA | CÓDIGO | DESCRIPCIÓN | DESC. MAX |
// CAPITAL-GBA OESTE EFECTIVO (SIN IVA) | ...TRANSFERENCIA (CON IVA) | ...3 CUOTAS (CON IVA) | ...6 CUOTAS (CON IVA) |
// GBA SUR-GBA NORTE EFECTIVO (SIN IVA) | ...TRANSFERENCIA (CON IVA) | ...3 CUOTAS (CON IVA) | ...6 CUOTAS (CON IVA)
const SERVICE_PRICE_COLS = [
  { key: 'p_capital_efectivo', match: ['CAPITAL', 'EFECTIVO'] },
  { key: 'p_capital_transferencia', match: ['CAPITAL', 'TRANSFERENCIA'] },
  { key: 'p_capital_cuotas3', match: ['CAPITAL', '3 CUOTAS'] },
  { key: 'p_capital_cuotas6', match: ['CAPITAL', '6 CUOTAS'] },
  { key: 'p_gba_efectivo', match: ['GBA SUR', 'EFECTIVO'] },
  { key: 'p_gba_transferencia', match: ['GBA SUR', 'TRANSFERENCIA'] },
  { key: 'p_gba_cuotas3', match: ['GBA SUR', '3 CUOTAS'] },
  { key: 'p_gba_cuotas6', match: ['GBA SUR', '6 CUOTAS'] },
];

function detectColumnsServicios(ws) {
  const row = ws.getRow(HEADER_ROW);
  const headerTexts = [];
  for (let c = 1; c <= ws.columnCount; c++) headerTexts.push(normalizeHeader(row.getCell(c).value));

  const cols = {};
  const find = (aliases) => {
    for (let c = 0; c < headerTexts.length; c++) {
      if (headerTexts[c] && aliases.every((a) => headerTexts[c].includes(a))) return c + 1;
    }
    return null;
  };
  cols.codigo = find(['CODIGO']);
  cols.desc = find(['DESCRIPCION']);
  cols.desc_max = find(['DESC MAX']);
  SERVICE_PRICE_COLS.forEach(({ key, match }) => { const c = find(match); if (c) cols[key] = c; });
  return cols;
}

function parseServiciosSheet(ws, stats) {
  const cols = detectColumnsServicios(ws);
  if (!cols.codigo) {
    stats.SERVICIOS = { error: 'No se encontró la columna "CÓDIGO" en la fila de encabezados (fila 3)' };
    return [];
  }

  const rowsOut = [];
  for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.hidden) continue;
    const sectionText = isSectionRow(row);
    if (sectionText) { rowsOut.push({ type: 'section', seg: sectionText.replace(/▌/g, '').trim() }); continue; }
    const codeVal = getCellValue(row.getCell(cols.codigo));
    if (!codeVal || normalizeHeader(codeVal) === 'CODIGO') continue;

    const item = { type: 'product' };
    for (const [key, colNum] of Object.entries(cols)) {
      item[key] = getCellValue(row.getCell(colNum));
    }
    rowsOut.push(item);
  }

  stats.SERVICIOS = { servicios: rowsOut.filter((x) => x.type === 'product').length };
  return rowsOut;
}

/**
 * Parsea el archivo "Lista INTERNA SEGTEC" (Buffer) y devuelve
 * { catalog: { CORREDIZOS:[...], LEVADIZOS:[...], PIVOTANTES:[...], ACCESORIOS:[...], SERVICIOS:[...] }, stats }
 */
async function parseCatalogXlsxInterna(fileBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileBuffer);

  const result = {};
  const stats = {};

  for (const sheetName of Object.keys(SHEET_KEYS)) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) { stats[sheetName] = { error: 'La hoja no existe en el archivo' }; result[sheetName] = []; continue; }
    result[sheetName] = await parseProductSheet(ws, sheetName, stats);
  }

  // La hoja de servicios puede llamarse "SERVICIOS" o, por typo histórico,
  // "SEERVICIOS" — se busca por coincidencia flexible del nombre.
  const serviciosSheet = wb.worksheets.find((ws) => normalizeHeader(ws.name).replace(/E+/g, 'E') === 'SERVICIOS')
    || wb.getWorksheet('SERVICIOS');
  if (serviciosSheet) {
    result.SERVICIOS = parseServiciosSheet(serviciosSheet, stats);
  } else {
    stats.SERVICIOS = { error: 'La hoja de Servicios no existe en el archivo' };
    result.SERVICIOS = [];
  }

  applySharedPhotoOverrides(result);

  return { catalog: result, stats };
}

function applySharedPhotoOverrides(catalog) {
  const byCode = new Map();
  for (const items of Object.values(catalog)) {
    for (const it of items) if (it.type === 'product' && it.codigo) byCode.set(it.codigo, it);
  }
  for (const { from, to } of SHARED_PHOTO_PAIRS) {
    const source = byCode.get(from);
    const target = byCode.get(to);
    if (source && source.img && target) target.img = source.img;
  }
}

module.exports = { parseCatalogXlsxInterna };
