/**
 * Sheet access for KSK's own spreadsheet.
 *
 * Every read and write goes through the column map, so KSK's real tab and
 * header names can be plugged in without code changes. Functions end in "_"
 * so the browser cannot call them through google.script.run.
 */

function userError_(message, fields, code) {
  var e = new Error(message);
  e.userFacing = true;
  e.fields = fields || null;
  e.code = code || '';
  return e;
}

function isDate_(value) {
  return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
}

function getSpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROPS.sheetId);
  if (id) return SpreadsheetApp.openById(id);
  throw userError_('ResQStock is not set up yet. Ask an admin to open the sheet and run ResQStock > Set up or check.', null, 'setup');
}

/** getSheetByName, but forgiving about case and extra spaces. */
function findSheet_(ss, name) {
  if (!name) return null;
  var exact = ss.getSheetByName(name);
  if (exact) return exact;
  var want = Logic.normName(name);
  var hit = null;
  ss.getSheets().forEach(function (s) { if (!hit && Logic.normName(s.getName()) === want) hit = s; });
  return hit;
}

/* -------------------------------------------------------------------- */
/* Dates and time zone                                                  */
/* -------------------------------------------------------------------- */

/**
 * Cell dates are shown in the spreadsheet's own time zone, so that one wins.
 * RQ_Settings time_zone is the fallback, and setup warns when the two differ.
 */
function timeZone_(ss, settings) {
  var tz = '';
  try { tz = ss.getSpreadsheetTimeZone(); } catch (e) { tz = ''; }
  return tz || (settings && settings.timeZone) || 'Asia/Kuala_Lumpur';
}

function todayIso_(tz) { return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'); }

function nowStamp_(tz) { return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"); }

function cellToIso_(value, tz) {
  if (isDate_(value)) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  return Logic.parseDay(value);
}

function isoToDate_(iso, tz) { return Utilities.parseDate(iso, tz, 'yyyy-MM-dd'); }

function stampToDate_(stamp, tz) { return Utilities.parseDate(stamp, tz, "yyyy-MM-dd'T'HH:mm:ss"); }

/* -------------------------------------------------------------------- */
/* Settings                                                             */
/* -------------------------------------------------------------------- */

function readSettings_(ss) {
  var sheet = findSheet_(ss, CONFIG.TABS.settings);
  var rows = [];
  if (sheet && sheet.getLastRow() >= 2) rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  return Logic.parseSettings(rows, CONFIG.SETTINGS);
}

function writeSetting_(ss, key, value) {
  var sheet = findSheet_(ss, CONFIG.TABS.settings);
  if (!sheet) throw userError_('The RQ_Settings tab is missing. Run ResQStock > Set up or check.', null, 'setup');
  var last = sheet.getLastRow();
  if (last >= 2) {
    var keys = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (Logic.cleanText(keys[i][0]) === key) {
        sheet.getRange(i + 2, 2).setValue(value);
        return;
      }
    }
  }
  sheet.appendRow([key, value, '']);
}

/* -------------------------------------------------------------------- */
/* Column map                                                           */
/* -------------------------------------------------------------------- */

function defaultColumnMap_() {
  var map = {};
  Object.keys(CONFIG.TABLES).forEach(function (key) {
    var def = CONFIG.TABLES[key];
    var fields = {};
    def.fields.forEach(function (f) {
      fields[f.key] = { key: f.key, header: f.header, required: !!f.required, suggest: !!f.suggest, note: f.note || '' };
    });
    map[key] = { key: key, label: def.label, tab: def.tab, headerRow: 1, typeValue: '', fields: fields, order: def.fields.map(function (f) { return f.key; }) };
  });
  return map;
}

/**
 * RQ_ColumnMap rows: Table | Field | Header | Notes.
 * Special fields: _tab (tab name), _headerRow (row number of the headers),
 * _typeValue (when stock in and out share one tab: the Type value for this table).
 */
function readColumnMap_(ss) {
  var map = defaultColumnMap_();
  var sheet = findSheet_(ss, CONFIG.TABS.columnMap);
  if (!sheet || sheet.getLastRow() < 2) return map;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  values.forEach(function (r) {
    var table = map[Logic.cleanText(r[0])];
    var field = Logic.cleanText(r[1]);
    var header = Logic.cleanText(r[2]);
    if (!table || !field) return;
    if (field === '_tab') { if (header) table.tab = header; }
    else if (field === '_headerRow') { var n = parseInt(header, 10); if (n >= 1) table.headerRow = n; }
    else if (field === '_typeValue') { table.typeValue = header; }
    else if (table.fields[field]) { table.fields[field].header = header; }
  });
  return map;
}

/** Opens one logical table: finds its tab and where each field's column is. */
function openTable_(ss, t) {
  var sheet = findSheet_(ss, t.tab);
  if (!sheet) throw userError_('Could not find the tab "' + t.tab + '". Check RQ_ColumnMap, then run ResQStock > Set up or check.', null, 'setup');
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(t.headerRow, 1, 1, lastCol).getValues()[0].map(function (h) { return Logic.normName(h); });
  var cols = {};
  Object.keys(t.fields).forEach(function (k) {
    var want = Logic.normName(t.fields[k].header);
    cols[k] = want ? headers.indexOf(want) + 1 : 0; // 0 = not in this sheet
  });
  var missing = Object.keys(t.fields).filter(function (k) { return t.fields[k].required && !cols[k]; });
  if (missing.length) {
    throw userError_('The tab "' + sheet.getName() + '" has no ' +
      missing.map(function (k) { return '"' + (t.fields[k].header || k) + '"'; }).join(' or ') +
      ' column. Check the headers in row ' + t.headerRow + ', or update RQ_ColumnMap.', null, 'setup');
  }
  return { sheet: sheet, map: t, cols: cols, lastCol: lastCol };
}

function readRows_(table, tz) {
  var sheet = table.sheet;
  var first = table.map.headerRow + 1;
  var last = sheet.getLastRow();
  if (last < first) return [];
  var values = sheet.getRange(first, 1, last - first + 1, table.lastCol).getValues();
  var typeCol = table.cols.type;
  var typeValue = Logic.normName(table.map.typeValue);
  var out = [];
  values.forEach(function (v, i) {
    if (typeCol && typeValue && Logic.normName(v[typeCol - 1]) !== typeValue) return;
    var rec = { row: first + i };
    Object.keys(table.cols).forEach(function (k) {
      var c = table.cols[k];
      var raw = c ? v[c - 1] : '';
      if (k === 'date' || k === 'expiry') rec[k] = cellToIso_(raw, tz);
      else if (k === 'qty') rec[k] = Logic.toNumber(raw);
      else rec[k] = Logic.cleanText(isDate_(raw) ? cellToIso_(raw, tz) : raw);
    });
    if (!rec.item && rec.qty === null) return; // blank line
    out.push(rec);
  });
  return out;
}

/** Appends one record as a new row. Columns ResQStock does not know stay blank. */
function appendRecord_(table, rec, tz) {
  var row = [];
  for (var c = 0; c < table.lastCol; c++) row.push('');
  Object.keys(table.cols).forEach(function (k) {
    var col = table.cols[k];
    var v = rec[k];
    if (!col || v === undefined || v === null || v === '') return;
    if (k === 'date' || k === 'expiry') v = isoToDate_(v, tz);
    row[col - 1] = v;
  });
  if (table.cols.type && table.map.typeValue) row[table.cols.type - 1] = table.map.typeValue;
  table.sheet.appendRow(row);
  return table.sheet.getLastRow();
}

function newBatchId_(tz) {
  return 'B' + Utilities.formatDate(new Date(), tz, 'yyMMdd-HHmmss') + '-' + Math.floor(10 + Math.random() * 90);
}

/* -------------------------------------------------------------------- */
/* RQ_Items                                                             */
/* -------------------------------------------------------------------- */

function itemColumns_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return Logic.normName(h); });
  var find = function (h) { return headers.indexOf(Logic.normName(h)) + 1; };
  return {
    lastCol: lastCol,
    id: find('Item ID'),
    name: find('Item name'),
    category: find('Category'),
    unit: find('Unit'),
    target: find('Target level'),
    show: find('Show on wishlist'),
    override: find('Priority override')
  };
}

function readItems_(ss) {
  var sheet = findSheet_(ss, CONFIG.TABS.items);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var c = itemColumns_(sheet);
  if (!c.name) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, c.lastCol).getValues();
  var get = function (v, col) { return col ? v[col - 1] : ''; };
  var out = [];
  values.forEach(function (v, i) {
    var name = Logic.cleanText(get(v, c.name));
    if (!name) return;
    out.push({
      row: i + 2,
      id: Logic.cleanText(get(v, c.id)),
      name: name,
      category: Logic.cleanText(get(v, c.category)),
      unit: Logic.cleanText(get(v, c.unit)),
      target: Logic.toNumber(get(v, c.target)),
      show: Logic.toBool(get(v, c.show)),
      override: Logic.normPriority(get(v, c.override))
    });
  });
  return out;
}

function appendItem_(ss, item) {
  var sheet = findSheet_(ss, CONFIG.TABS.items);
  if (!sheet) throw userError_('The RQ_Items tab is missing. Run ResQStock > Set up or check.', null, 'setup');
  var c = itemColumns_(sheet);
  var row = [];
  for (var i = 0; i < c.lastCol; i++) row.push('');
  var put = function (col, v) { if (col && v !== undefined && v !== null) row[col - 1] = v; };
  put(c.id, item.id);
  put(c.name, item.name);
  put(c.category, item.category || '');
  put(c.unit, item.unit || '');
  put(c.target, item.target > 0 ? item.target : '');
  put(c.show, item.show ? 'Yes' : 'No');
  put(c.override, item.override || '');
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** fields: any of { target, show, override, id }. */
function updateItemRow_(ss, rowNumber, fields) {
  var sheet = findSheet_(ss, CONFIG.TABS.items);
  var c = itemColumns_(sheet);
  if (fields.id !== undefined && c.id) sheet.getRange(rowNumber, c.id).setValue(fields.id);
  if (fields.target !== undefined && c.target) sheet.getRange(rowNumber, c.target).setValue(fields.target > 0 ? fields.target : '');
  if (fields.show !== undefined && c.show) sheet.getRange(rowNumber, c.show).setValue(fields.show ? 'Yes' : 'No');
  if (fields.override !== undefined && c.override) sheet.getRange(rowNumber, c.override).setValue(fields.override || '');
}

/* -------------------------------------------------------------------- */
/* RQ_Photos                                                            */
/* -------------------------------------------------------------------- */

var PHOTO_PATTERN_ = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;

function photosSheet_(ss, create) {
  var sheet = findSheet_(ss, CONFIG.TABS.photos);
  if (!sheet && create) {
    sheet = ss.insertSheet(CONFIG.TABS.photos);
    sheet.getRange(1, 1, 1, CONFIG.PHOTO.headers.length).setValues([CONFIG.PHOTO.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  return sheet;
}

/** { 'RICE-01': { row, version } }, read without the image data so every request stays light. */
function readPhotoIndex_(ss) {
  var index = {};
  var sheet = photosSheet_(ss, false);
  if (!sheet || sheet.getLastRow() < 2) return index;
  var n = sheet.getLastRow() - 1;
  var ids = sheet.getRange(2, 1, n, 1).getValues();
  var versions = sheet.getRange(2, 3, n, 1).getValues();
  ids.forEach(function (r, i) {
    var id = Logic.cleanText(r[0]).toUpperCase();
    if (id) index[id] = { row: i + 2, version: Logic.cleanText(versions[i][0]) || 'row' + (i + 2) };
  });
  return index;
}

/** The images themselves, only for the IDs asked for. Anything that is not an image is skipped. */
function readPhotos_(ss, ids) {
  var out = {};
  var sheet = photosSheet_(ss, false);
  if (!sheet || sheet.getLastRow() < 2) return out;
  var want = {};
  ids.forEach(function (id) { want[String(id).toUpperCase()] = true; });
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function (r, i) {
    var id = Logic.cleanText(r[0]).toUpperCase();
    var data = String(r[1] || '');
    if (id && want[id] && PHOTO_PATTERN_.test(data)) out[id] = { url: data, version: Logic.cleanText(r[2]) || 'row' + (i + 2) };
  });
  return out;
}

/** Saves or replaces an item's photo. Returns its new version, which tells phones to refresh their copy. */
function writePhoto_(ss, itemId, dataUrl, tz) {
  var sheet = photosSheet_(ss, true);
  var version = Utilities.formatDate(new Date(), tz, 'yyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 6);
  var hit = readPhotoIndex_(ss)[itemId.toUpperCase()];
  var row = [itemId, dataUrl, version];
  if (hit) sheet.getRange(hit.row, 1, 1, 3).setValues([row]);
  else sheet.appendRow(row);
  return version;
}

function deletePhoto_(ss, itemId) {
  var sheet = photosSheet_(ss, false);
  var hit = sheet ? readPhotoIndex_(ss)[itemId.toUpperCase()] : null;
  if (hit) sheet.deleteRow(hit.row);
}

/* -------------------------------------------------------------------- */
/* Whole state                                                          */
/* -------------------------------------------------------------------- */

/** Reads everything one request needs and builds the inventory. */
function loadState_() {
  var ss = getSpreadsheet_();
  var settings = readSettings_(ss);
  var tz = timeZone_(ss, settings);
  var map = readColumnMap_(ss);
  var tables = { stockIn: openTable_(ss, map.stockIn), stockOut: openTable_(ss, map.stockOut) };
  var raw = {
    items: readItems_(ss),
    stockIn: readRows_(tables.stockIn, tz),
    stockOut: readRows_(tables.stockOut, tz)
  };
  var state = { ss: ss, settings: settings, tz: tz, map: map, tables: tables, raw: raw, today: todayIso_(tz), photoIndex: readPhotoIndex_(ss) };
  rebuild_(state);
  return state;
}

/** Recomputes the inventory from state.raw (after an in-memory change). */
function rebuild_(state) {
  state.inventory = Logic.buildInventory({
    items: state.raw.items,
    stockIn: state.raw.stockIn,
    stockOut: state.raw.stockOut,
    today: state.today,
    soonDays: state.settings.soonDays
  });
  return state;
}

function capabilities_(state) {
  var tin = state.tables.stockIn.cols;
  var tout = state.tables.stockOut.cols;
  return { expiry: !!tin.expiry, batchIds: !!(tin.batchId && tout.batchId) };
}

function currentUserEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw userError_('The sheet is busy. Please try again in a moment.', null, 'busy');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
