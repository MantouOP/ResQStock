/** Reviewed incoming-stock imports. All entry points use api()'s access check. */
function importRows_(p) {
  if (!Array.isArray(p.rows) || !p.rows.length || p.rows.length > 200) throw userError_('Include between 1 and 200 rows.', null, 'invalid');
  return p.rows.map(function (r) {
    if (!r || typeof r !== 'object') throw userError_('An import row is invalid.', null, 'invalid');
    var out = {};
    ['name', 'unit', 'category', 'expiry', 'received', 'source'].forEach(function (k) {
      out[k] = Logic.cleanText(r[k]);
      if (out[k].length > 300) throw userError_('An import field is too long.', null, 'invalid');
    });
    out.qty = typeof r.qty === 'number' ? r.qty : Logic.cleanText(r.qty);
    out.noExpiry = r.noExpiry === true;
    return out;
  });
}

function importKey_(rows) {
  // Compare the complete canonical content, not a collision-prone short hash.
  // The filename, source label and line order do not defeat duplicate detection.
  return JSON.stringify(rows.map(function (r) {
    return [Logic.normName(r.name), Number(r.qty), Logic.normName(r.unit), r.expiry, r.noExpiry, r.received];
  }).sort(function (a, b) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); }));
}

function validateImport_(rows, state) {
  var known = Object.create(null), proposed = Object.create(null), seen = Object.create(null), warnings = [], caps = capabilities_(state);
  state.inventory.items.forEach(function (it) { known[Logic.normName(it.name)] = it; });
  var checked = rows.map(function (r, i) {
    var errors = Logic.validateStockIn(r, state.today, caps.expiry);
    var limits = { name: 80, unit: 40, category: 80, source: 200 };
    Object.keys(limits).forEach(function (k) {
      if (r[k].length > limits[k]) errors[k] = 'Use at most ' + limits[k] + ' characters.';
      if (/^[=+@-]/.test(r[k])) errors[k] = 'Formula-like text is not allowed.';
    });
    if (!r.name) errors.name = 'Enter the item name.';
    if (!r.unit) errors.unit = 'Enter the unit (for example, tins or kg).';
    if (!/^(?:\d+)(?:\.\d{1,3})?$/.test(String(r.qty)) || !(Number(r.qty) > 0 && Number(r.qty) <= 100000)) errors.qty = 'Use a quantity above 0, up to 100,000, with at most 3 decimal places.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.received)) errors.received = 'Choose the received date.';
    if (r.noExpiry && r.expiry) errors.expiry = 'Clear the expiry date or untick No expiry.';
    var key = Logic.normName(r.name), item = known[key], earlier = proposed[key];
    if (item && Logic.normName(r.unit) !== Logic.normName(item.unit)) errors.unit = 'This item uses ' + (item.unit || 'no unit') + '. Check the item or convert the quantity first.';
    if (!item && earlier && Logic.normName(r.unit) !== Logic.normName(earlier.unit)) errors.unit = 'All rows for a new item must use the same unit.';
    if (!item && earlier && Logic.normName(r.category) !== Logic.normName(earlier.category)) errors.category = 'All rows for a new item must use the same category.';
    if (!earlier) proposed[key] = r;
    var signature = importKey_([r]);
    if (seen[signature]) warnings.push('Rows ' + seen[signature] + ' and ' + (i + 1) + ' appear identical.');
    else seen[signature] = i + 1;
    if (!caps.expiry && r.expiry) errors.expiry = 'This stock log has no expiry column. Configure it before importing expiry dates.';
    return { row: i + 1, name: item ? item.name : r.name, unit: item ? item.unit : r.unit, category: item ? item.category : r.category, match: item && !item.unlisted ? 'existing' : 'new', errors: errors };
  });
  return { rows: checked, valid: checked.every(function (r) { return !Object.keys(r.errors).length; }), warnings: warnings };
}

// Chunked JSON keeps every cell below Sheets' 50,000-character limit. Prefixes
// also keep arbitrary chunk boundaries from becoming spreadsheet formulas.
var IMPORT_JOURNAL_CHUNKS_ = 32;
function importJournal_(ss, create) {
  var sheet = ss.getSheetByName('RQ_Imports');
  if (!sheet && create) {
    sheet = ss.insertSheet('RQ_Imports');
    if (sheet.getMaxColumns() < IMPORT_JOURNAL_CHUNKS_ + 1) sheet.insertColumnsAfter(sheet.getMaxColumns(), IMPORT_JOURNAL_CHUNKS_ + 1 - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, 2).setValues([['Import ID', 'Journal (managed by ResQStock; do not edit)']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function readImportJournal_(ss) {
  var sheet = importJournal_(ss, false);
  if (!sheet || sheet.getLastRow() < 2) return [];
  if (sheet.getLastRow() > 2001) throw userError_('The import journal is full. Ask the administrator to archive it before importing.', null, 'setup');
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, IMPORT_JOURNAL_CHUNKS_ + 1).getValues().map(function (cells, index) {
    try {
      var json = cells.slice(1).filter(function (s) { return s !== ''; }).map(function (s) {
        if (String(s).slice(0, 2) !== 'j:') throw new Error('bad chunk');
        return String(s).slice(2);
      }).join('');
      var data = JSON.parse(json);
      if (data.id !== cells[0] || !data.intent || !data.plan || !/^(pending|complete)$/.test(data.status)) throw new Error('bad entry');
      return { row: index + 2, data: data };
    } catch (e) { throw userError_('The import journal was changed or damaged. Ask an administrator to check RQ_Imports before importing again.', null, 'conflict'); }
  });
}
function saveImportJournal_(sheet, row, data) {
  var json = JSON.stringify(data), cells = [data.id];
  if (json.length > 40000 * IMPORT_JOURNAL_CHUNKS_) throw userError_('This import is too large. Split it into smaller files.', null, 'invalid');
  for (var i = 0; i < IMPORT_JOURNAL_CHUNKS_; i++) cells.push(i * 40000 < json.length ? 'j:' + json.slice(i * 40000, (i + 1) * 40000) : '');
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
  sheet.getRange(row, 1, 1, cells.length).setValues([cells]);
  SpreadsheetApp.flush();
}

function apiPreviewImport_(p) {
  var rows = importRows_(p), state = loadState_(), result = validateImport_(rows, state), key = importKey_(rows);
  readImportJournal_(state.ss).forEach(function (entry) {
    if (entry.data.key === key) result.warnings.push(entry.data.status === 'complete' ? 'These quantities were already imported. Continue only for a separate delivery.' : 'This content has an unfinished import. Retry that import instead of starting another.');
  });
  return result;
}

function importPlan_(rows, state, id) {
  var table = state.tables.stockIn, known = Object.create(null), items = [], ids = state.raw.items.map(function (it) { return it.id; });
  if (table.lastCol > 100) throw userError_('The stock log has more than 100 columns. Ask an administrator to check its mapping.', null, 'setup');
  state.raw.items.forEach(function (it) { known[Logic.normName(it.name)] = it; });
  var values = rows.map(function (r, index) {
    var key = Logic.normName(r.name), item = known[key];
    if (!item) {
      item = { id: Logic.makeItemId(r.name, ids), name: r.name, unit: r.unit, category: r.category, target: 0, show: false, override: '' };
      ids.push(item.id); items.push(item); known[key] = item;
    }
    var rec = { date: r.received, item: item.name, itemId: item.id, unit: item.unit, category: item.category, qty: Number(r.qty), expiry: r.noExpiry ? '' : r.expiry, source: r.source, recordedBy: currentUserEmail_() || 'staff app', batchId: 'I-' + id + '-' + (index + 1) };
    var cells = Array(table.lastCol).fill('');
    Object.keys(table.cols).forEach(function (k) { if (table.cols[k] && rec[k] !== undefined) cells[table.cols[k] - 1] = rec[k]; });
    if (table.cols.type && table.map.typeValue) cells[table.cols.type - 1] = table.map.typeValue;
    return cells;
  });
  return { tab: table.sheet.getName(), sheetId: table.sheet.getSheetId(), start: table.sheet.getLastRow() + 1, width: table.lastCol, dateCols: [table.cols.date, table.cols.expiry].filter(Boolean), values: values, items: items, tz: state.tz };
}
function writeImportStock_(sheet, plan) {
  var end = plan.start + plan.values.length - 1;
  if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
  var values = plan.values.map(function (row) { return row.map(function (v, i) { return v && plan.dateCols.indexOf(i + 1) >= 0 ? isoToDate_(v, plan.tz) : v; }); });
  sheet.getRange(plan.start, 1, values.length, plan.width).setValues(values);
  SpreadsheetApp.flush();
}
function resumeImport_(ss, journal, entry) {
  var data = entry.data, plan = data.plan;
  if (data.status === 'complete') return data.result;
  var sheet = ss.getSheetByName(plan.tab);
  if (!sheet || sheet.getSheetId() !== plan.sheetId) throw userError_('The import destination changed. Ask an administrator to reconcile this import.', null, 'conflict');
  // Ensure read capacity without writing stock. Existing/new metadata is reused on retries.
  var end = plan.start + plan.values.length - 1;
  if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
  var actual = sheet.getRange(plan.start, 1, plan.values.length, plan.width).getValues().map(function (row) {
    return row.map(function (v, i) { return v && plan.dateCols.indexOf(i + 1) >= 0 ? cellToIso_(v, plan.tz) : v; });
  });
  var same = JSON.stringify(actual) === JSON.stringify(plan.values);
  var empty = actual.every(function (r) { return r.every(function (v) { return v === ''; }); });
  if (!same && (!empty || sheet.getLastRow() !== plan.start - 1)) throw userError_('The saved import range is partly filled or has changed. No stock was added on this retry. Ask an administrator to reconcile it in RQ_Imports.', null, 'conflict');
  if (!same) {
    var existing = readItems_(ss);
    plan.items.forEach(function (item) {
      var match = existing.filter(function (it) { return Logic.normName(it.name) === Logic.normName(item.name); })[0];
      if (match && (match.id !== item.id || match.unit !== item.unit)) throw userError_('An imported item changed while saving. Ask an administrator to check it.', null, 'conflict');
      if (!match) { appendItem_(ss, item); existing.push(item); }
    });
    writeImportStock_(sheet, plan);
  }
  data.status = 'complete';
  data.result = { id: data.id, count: plan.values.length, newItems: plan.items.length, message: 'Imported ' + plan.values.length + ' incoming stock rows.' };
  // Record durable success before the optional wishlist refresh. A refresh failure
  // must never turn a completed import into another stock write.
  saveImportJournal_(journal, entry.row, data);
  try { trySyncWishlist_(loadState_()); } catch (e) { console.warn('Import saved; wishlist refresh deferred: ' + e.message); }
  return data.result;
}
function apiCommitImport_(p) {
  return withLock_(function () {
    if (p.reviewed !== true) throw userError_('Review and confirm the included rows first.', null, 'invalid');
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(String(p.id || ''))) throw userError_('The import ID is missing. Reload the import screen.', null, 'invalid');
    var rows = importRows_(p), intent = JSON.stringify(rows), state = loadState_(), entries = readImportJournal_(state.ss);
    var old = entries.filter(function (e) { return e.data.id === p.id; })[0];
    if (old) {
      if (old.data.intent !== intent) throw userError_('This import ID belongs to different rows. Start a new import after checking the previous result.', null, 'conflict');
      return resumeImport_(state.ss, importJournal_(state.ss, false), old);
    }
    if (entries.length >= 2000) throw userError_('The import journal is full. Ask the administrator to archive it.', null, 'setup');
    var checked = validateImport_(rows, state);
    if (!checked.valid) throw userError_('Check all included rows before importing.', checked.rows, 'invalid');
    var key = importKey_(rows), duplicates = entries.filter(function (e) { return e.data.key === key; });
    if (duplicates.some(function (e) { return e.data.status === 'pending'; })) throw userError_('This content has an unfinished import. Retry it with its original ID.', null, 'pending');
    if ((duplicates.length || checked.warnings.length) && p.allowDuplicate !== true) throw userError_('Possible duplicate stock. Confirm that these are separate deliveries before continuing.', null, 'duplicate');
    var journal = importJournal_(state.ss, true), entry = { row: journal.getLastRow() + 1, data: { id: p.id, status: 'pending', intent: intent, key: key, plan: importPlan_(rows, state, p.id) } };
    saveImportJournal_(journal, entry.row, entry.data);
    return resumeImport_(state.ss, journal, entry);
  });
}

function apiReadImportSheet_(p) {
  if (!/^[a-zA-Z0-9_-]{20,180}$/.test(String(p.id || '')) || !/^\d{1,15}$/.test(String(p.gid === undefined ? '0' : p.gid))) throw userError_('Use a valid Google Sheets link.', null, 'invalid');
  var source;
  try { source = SpreadsheetApp.openById(p.id); } catch (e) { throw userError_('Your Google account cannot open this sheet. Export it as CSV/XLSX or copy and paste its cells.', null, 'source'); }
  var gid = String(p.gid === undefined ? '0' : p.gid);
  var sheet = source.getSheets().filter(function (s) { return String(s.getSheetId()) === gid; })[0];
  if (!sheet) throw userError_('That worksheet was not found. Copy the link while the required worksheet is selected.', null, 'source');
  if (sheet.getLastRow() > 1000 || sheet.getLastColumn() > 60) throw userError_('Use a worksheet with at most 1,000 source rows and 60 columns, or paste a smaller selection.', null, 'source');
  var matrix = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), Math.max(sheet.getLastColumn(), 1)).getDisplayValues();
  if (JSON.stringify(matrix).length > 2000000) throw userError_('This worksheet is too large. Paste a smaller selection.', null, 'source');
  return { name: sheet.getName(), matrix: matrix };
}
