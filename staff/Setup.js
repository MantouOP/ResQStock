/**
 * The ResQStock menu inside KSK's sheet, and the setup check.
 *
 * Every menu function starts with SpreadsheetApp.getUi(), which only works
 * inside the sheet. Called from the web app, it throws, so these functions
 * cannot be used from a phone even though Apps Script exposes them.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ResQStock')
    .addItem('Set up or check', 'menuSetup')
    .addItem('Open the staff app', 'menuOpenApp')
    .addItem('Sync the donor wishlist now', 'menuSyncWishlist')
    .addSeparator()
    .addItem('Create the public wishlist spreadsheet', 'menuCreateWishlistSheet')
    .addItem('Turn on hourly wishlist sync', 'menuInstallTriggers')
    .addItem('Set or clear the staff PIN (option C only)', 'menuSetPin')
    .addSeparator()
    .addItem('Load mock data (development only)', 'menuLoadMockData')
    .addToUi();
}

/* -------------------------------------------------------------------- */
/* Menu actions                                                         */
/* -------------------------------------------------------------------- */

function menuSetup() {
  var ui = SpreadsheetApp.getUi();
  var report = runSetup_({});
  if (!report.errors.length && report.suggested.length) {
    var list = report.suggested.map(function (s) { return '- ' + s.header + ' (tab "' + s.tab + '")'; }).join('\n');
    var answer = ui.alert(
      'Add columns?',
      'ResQStock works best with these columns, which your stock tabs do not have yet:\n\n' + list +
        '\n\nAdd them at the end of the tab? Existing columns are not moved or changed.',
      ui.ButtonSet.YES_NO
    );
    if (answer === ui.Button.YES) report = runSetup_({ addSuggestedColumns: true });
  }
  ui.alert('ResQStock setup', setupReportText_(report), ui.ButtonSet.OK);
}

function menuOpenApp() {
  var ui = SpreadsheetApp.getUi();
  var url = staffAppUrl_(readSettings_(SpreadsheetApp.getActiveSpreadsheet()));
  if (!url) {
    ui.alert('Not deployed yet', 'Deploy the staff app first: Extensions > Apps Script > Deploy > New deployment > Web app. docs/SETUP.md has the exact settings.', ui.ButtonSet.OK);
    return;
  }
  var safe = htmlEscape_(url);
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 sans-serif"><p>Staff app link:</p><p style="word-break:break-all"><a href="' + safe + '" target="_blank" rel="noopener">' + safe + '</a></p></div>'
  ).setWidth(440).setHeight(160);
  ui.showModalDialog(html, 'ResQStock staff app');
}

function menuSyncWishlist() {
  var ui = SpreadsheetApp.getUi();
  var result = syncWishlist_();
  ui.alert('Donor wishlist', result.ok ? 'Updated. ' + result.count + ' items are on the donor wishlist.' : result.skipped, ui.ButtonSet.OK);
}

function menuCreateWishlistSheet() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(CONFIG.PROPS.wishlistId)) {
    var again = ui.alert('Replace it?', 'A public wishlist spreadsheet already exists. Create a new one and stop updating the old one?', ui.ButtonSet.YES_NO);
    if (again !== ui.Button.YES) return;
  }
  var pub = createWishlistSpreadsheet_();
  var result = trySyncWishlist_();
  ui.alert(
    'Public wishlist spreadsheet created',
    'Link: ' + pub.getUrl() +
      '\n\nNext, in the public wishlist Apps Script project, open Project Settings > Script Properties and add:\n' +
      'WISHLIST_SHEET_ID = ' + pub.getId() +
      '\n\nFirst sync: ' + (result.ok ? result.count + ' items.' : result.skipped),
    ui.ButtonSet.OK
  );
}

function menuInstallTriggers() {
  var ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'hourlyWishlistSync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('hourlyWishlistSync').timeBased().everyHours(1).create();
  var who = '';
  try { who = Session.getEffectiveUser().getEmail(); } catch (e) { who = ''; }
  ui.alert(
    'Hourly sync is on',
    'The donor wishlist will refresh every hour, running as ' + (who || 'this account') + '. Keep this account as the owner of both spreadsheets.',
    ui.ButtonSet.OK
  );
}

function menuSetPin() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var has = !!props.getProperty(CONFIG.PROPS.pin);
  var res = ui.prompt(
    'Staff PIN (access option C)',
    (has ? 'A PIN is set. Enter a new one, or leave this blank and press OK to remove it.\n\n'
         : 'Only use a PIN if staff cannot sign in with Google (access option C).\n\n') +
      'Use at least ' + CONFIG.PIN.minLength + ' digits.',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pin = res.getResponseText().replace(/\s+/g, '');
  if (!pin) {
    props.deleteProperty(CONFIG.PROPS.pin);
    ui.alert('PIN removed. The staff app now relies on Google sign-in only.');
    return;
  }
  if (!/^\d+$/.test(pin) || pin.length < CONFIG.PIN.minLength) {
    ui.alert('Use digits only, at least ' + CONFIG.PIN.minLength + ' of them. Nothing was changed.');
    return;
  }
  props.setProperty(CONFIG.PROPS.pin, pin);
  ui.alert('PIN saved. Share it with staff in person, not in a group chat, and change it every month.');
}

function menuLoadMockData() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    'Load mock data?',
    'This fills the stock tabs with FAKE data for development and testing. Use it only in the mock sheet, never in KSK\'s real sheet.',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;
  var result = loadMockData_(SpreadsheetApp.getActiveSpreadsheet());
  if (!result.ok) {
    ui.alert('Mock data not loaded', result.reason, ui.ButtonSet.OK);
    return;
  }
  ui.alert(
    'Mock data loaded',
    result.counts.items + ' items, ' + result.counts.stockIn + ' stock-in rows and ' + result.counts.stockOut + ' stock-out rows.\n\n' + setupReportText_(runSetup_({})),
    ui.ButtonSet.OK
  );
}

/* -------------------------------------------------------------------- */
/* Setup check                                                          */
/* -------------------------------------------------------------------- */

/**
 * Creates the RQ_ tabs, checks KSK's stock tabs against RQ_ColumnMap and
 * lists items found in the stock tabs. Safe to run again at any time.
 * opts.addSuggestedColumns: add missing suggested columns (Expiry date, Batch ID).
 * opts.createMissingTabs:  create missing stock tabs (mock sheet only).
 */
function runSetup_(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  props.setProperty(CONFIG.PROPS.sheetId, ss.getId());
  var report = { errors: [], suggested: [], added: [], created: [], notes: [], counts: null, warnings: [] };

  ensureSettingsTab_(ss, report);
  ensureColumnMapTab_(ss, report);
  ensureItemsTab_(ss, report);
  if (!findSheet_(ss, CONFIG.TABS.photos)) {
    photosSheet_(ss, true);
    report.created.push('hidden tab "' + CONFIG.TABS.photos + '" (item photos)');
  }

  var map = readColumnMap_(ss);
  checkTable_(ss, map.stockIn, opts, report);
  checkTable_(ss, map.stockOut, opts, report);
  if (report.errors.length) return report;

  var state = loadState_();
  fillMissingItemIds_(state, report);
  addUnlistedItems_(state, report);

  var sheetTz = '';
  try { sheetTz = ss.getSpreadsheetTimeZone(); } catch (e) { sheetTz = ''; }
  if (sheetTz && state.settings.timeZone && sheetTz !== state.settings.timeZone) {
    report.notes.push('This sheet\'s time zone is ' + sheetTz + ', but RQ_Settings expects ' + state.settings.timeZone +
      '. Change it in File > Settings so that dates and "today" are right.');
  }

  state = loadState_();
  report.counts = { items: state.raw.items.length, stockIn: state.raw.stockIn.length, stockOut: state.raw.stockOut.length };
  report.capabilities = capabilities_(state);
  report.warnings = state.inventory.warnings;
  report.wishlistConfigured = !!props.getProperty(CONFIG.PROPS.wishlistId);
  return report;
}

function checkTable_(ss, t, opts, report) {
  var sheet = findSheet_(ss, t.tab);
  if (!sheet) {
    if (!opts.createMissingTabs) {
      report.errors.push('No tab named "' + t.tab + '" for ' + t.label.toLowerCase() + '. Rename your tab, or change the _tab row for ' + t.key + ' in RQ_ColumnMap.');
      return;
    }
    sheet = ss.insertSheet(t.tab);
    var defaults = t.order.map(function (k) { return t.fields[k].header; }).filter(function (h) { return h; });
    sheet.getRange(t.headerRow, 1, 1, defaults.length).setValues([defaults]).setFontWeight('bold');
    sheet.setFrozenRows(t.headerRow);
    report.created.push('tab "' + t.tab + '"');
  }
  var headers = sheet.getRange(t.headerRow, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(function (h) { return Logic.normName(h); });
  t.order.forEach(function (k) {
    var f = t.fields[k];
    if (!f.header || headers.indexOf(Logic.normName(f.header)) >= 0) return;
    if (f.required) {
      report.errors.push('Tab "' + sheet.getName() + '" has no "' + f.header + '" column. Fix the header in row ' + t.headerRow + ', or change the ' + t.key + ' / ' + k + ' row in RQ_ColumnMap.');
    } else if (f.suggest && opts.addSuggestedColumns) {
      appendHeader_(sheet, t.headerRow, f.header);
      headers.push(Logic.normName(f.header));
      report.added.push('"' + f.header + '" in tab "' + sheet.getName() + '"');
    } else if (f.suggest) {
      report.suggested.push({ table: t.key, tab: sheet.getName(), header: f.header });
    } else {
      report.notes.push('Optional column "' + f.header + '" is not in tab "' + sheet.getName() + '", so ResQStock leaves it out.');
    }
  });
}

function ensureSettingsTab_(ss, report) {
  var sheet = findSheet_(ss, CONFIG.TABS.settings);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.TABS.settings);
    sheet.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Notes']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    report.created.push('tab "' + CONFIG.TABS.settings + '"');
  }
  var have = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { have[Logic.cleanText(r[0])] = true; });
  }
  var missing = CONFIG.SETTINGS.filter(function (s) { return !have[s[0]]; });
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
}

function columnMapDefaults_() {
  var rows = [];
  Object.keys(CONFIG.TABLES).forEach(function (key) {
    var def = CONFIG.TABLES[key];
    rows.push([key, '_tab', def.tab, 'Name of the ' + def.label.toLowerCase() + ' tab']);
    rows.push([key, '_headerRow', 1, 'Row number that holds the column headers']);
    rows.push([key, '_typeValue', '', 'Only if stock in and out share one tab: the value in its Type column']);
    def.fields.forEach(function (f) {
      rows.push([key, f.key, f.header, (f.required ? 'Required. ' : '') + (f.note || '')]);
    });
  });
  return rows;
}

function ensureColumnMapTab_(ss, report) {
  var sheet = findSheet_(ss, CONFIG.TABS.columnMap);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.TABS.columnMap);
    sheet.getRange(1, 1, 1, 4).setValues([['Table', 'Field', 'Header in your tab', 'Notes']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    report.created.push('tab "' + CONFIG.TABS.columnMap + '"');
  }
  var have = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
      have[Logic.cleanText(r[0]) + '/' + Logic.cleanText(r[1])] = true;
    });
  }
  var missing = columnMapDefaults_().filter(function (r) { return !have[r[0] + '/' + r[1]]; });
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 4).setValues(missing);
}

function ensureItemsTab_(ss, report) {
  var sheet = findSheet_(ss, CONFIG.TABS.items);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.TABS.items);
    sheet.getRange(1, 1, 1, CONFIG.ITEM_HEADERS.length).setValues([CONFIG.ITEM_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    report.created.push('tab "' + CONFIG.TABS.items + '"');
    return;
  }
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(function (h) { return Logic.normName(h); });
  CONFIG.ITEM_HEADERS.forEach(function (h) {
    if (headers.indexOf(Logic.normName(h)) >= 0) return;
    appendHeader_(sheet, 1, h);
    headers.push(Logic.normName(h));
    report.added.push('"' + h + '" in tab "' + CONFIG.TABS.items + '"');
  });
}

function fillMissingItemIds_(state, report) {
  var ids = state.raw.items.map(function (it) { return it.id; }).filter(function (id) { return id; });
  var filled = 0;
  state.raw.items.forEach(function (it) {
    if (it.id) return;
    it.id = Logic.makeItemId(it.name, ids);
    ids.push(it.id);
    updateItemRow_(state.ss, it.row, { id: it.id });
    filled++;
  });
  if (filled) report.notes.push('Gave ' + filled + ' items in RQ_Items an Item ID.');
}

function addUnlistedItems_(state, report) {
  var ids = state.raw.items.map(function (it) { return it.id; });
  var added = 0;
  state.inventory.items.forEach(function (item) {
    if (!item.unlisted) return;
    var id = Logic.makeItemId(item.name, ids);
    ids.push(id);
    appendItem_(state.ss, { id: id, name: item.name, category: item.category, unit: item.unit, target: null, show: false, override: '' });
    added++;
  });
  if (added) {
    report.notes.push('Added ' + added + ' items found in your stock tabs to RQ_Items. Set a target level for each one you want on the donor wishlist.');
  }
}

function setupReportText_(report) {
  var lines = [];
  if (report.errors.length) {
    lines.push('Setup needs attention:');
    report.errors.forEach(function (e) { lines.push('- ' + e); });
    lines.push('');
    lines.push('Fix these, then run ResQStock > Set up or check again.');
    return lines.join('\n');
  }
  lines.push('Setup check passed.');
  if (report.counts) {
    lines.push(report.counts.items + ' items, ' + report.counts.stockIn + ' stock-in rows, ' + report.counts.stockOut + ' stock-out rows.');
  }
  if (report.capabilities) {
    lines.push('Expiry tracking: ' + (report.capabilities.expiry ? 'on' : 'off (no expiry date column)') +
      '. Batch choice: ' + (report.capabilities.batchIds ? 'on' : 'off (no Batch ID columns)') + '.');
  }
  if (report.created.length) lines.push('Created: ' + report.created.join(', ') + '.');
  if (report.added.length) lines.push('Added columns: ' + report.added.join(', ') + '.');
  if (report.suggested.length) lines.push('Not added: ' + report.suggested.map(function (s) { return s.header; }).join(', ') + '.');
  report.notes.forEach(function (n) { lines.push(n); });
  (report.warnings || []).forEach(function (w) { lines.push('Check: ' + w); });
  if (!report.wishlistConfigured) lines.push('No public wishlist spreadsheet yet: use ResQStock > Create the public wishlist spreadsheet.');
  return lines.join('\n');
}

/* -------------------------------------------------------------------- */
/* Mock data (development only)                                         */
/* -------------------------------------------------------------------- */

/** Fills an empty mock sheet with fake data. Refuses if any stock rows exist. */
function loadMockData_(ss) {
  var report = runSetup_({ createMissingTabs: true, addSuggestedColumns: true });
  if (report.errors.length) return { ok: false, reason: report.errors.join('\n') };
  var state = loadState_();
  if (state.raw.stockIn.length || state.raw.stockOut.length) {
    return { ok: false, reason: 'The stock tabs already have records. Mock data only goes into an empty sheet.' };
  }
  var mock = MockData.build(state.today);
  var known = state.raw.items.map(function (it) { return Logic.normName(it.name); });
  mock.items.forEach(function (it) {
    if (known.indexOf(Logic.normName(it.name)) < 0) appendItem_(ss, it);
  });
  mock.stockIn.forEach(function (r) { appendRecord_(state.tables.stockIn, r, state.tz); });
  mock.stockOut.forEach(function (r) { appendRecord_(state.tables.stockOut, r, state.tz); });
  return { ok: true, counts: { items: mock.items.length, stockIn: mock.stockIn.length, stockOut: mock.stockOut.length } };
}

/** Writes a header into the first empty column, adding a column if the sheet is full. */
function appendHeader_(sheet, headerRow, header) {
  var col = sheet.getLastColumn() + 1;
  if (col > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
  sheet.getRange(headerRow, col).setValue(header).setFontWeight('bold');
}

function htmlEscape_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
