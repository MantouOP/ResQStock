'use strict';
/*
 * The staff and wishlist server code, end to end, on fake spreadsheets.
 * Test IDs (T1 ... T11) match the Testing section of the system plan.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { newDrive, loadApp, plain, api } = require('./harness');

function seeded() {
  const drive = newDrive();
  const staff = loadApp('staff', drive, { seed: true });
  assert.equal(staff.__rqSeedPreview({ baseUrl: 'https://example.test/' }), true);
  return { drive, staff, ss: staff.SpreadsheetApp.getActiveSpreadsheet() };
}

function ok(res) {
  assert.equal(res.ok, true, res.error);
  return res.data;
}

function headerIndex(sheet, name) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].indexOf(name) + 1;
}

test('setup creates the RQ_ tabs and finds the mock data', () => {
  const { staff, ss } = seeded();
  const report = plain(staff.runSetup_({}));
  assert.deepEqual(report.errors, []);
  assert.equal(report.counts.items, 16);
  assert.equal(report.capabilities.expiry, true);
  assert.equal(report.capabilities.batchIds, true);
  const tabs = ss.getSheets().map((s) => s.getName());
  ['Stock In', 'Stock Out', 'RQ_Items', 'RQ_Settings', 'RQ_ColumnMap'].forEach((t) => assert.ok(tabs.includes(t), t));
});

test('setup warns when the sheet is not on Malaysia time', () => {
  const { staff, ss } = seeded();
  ss.setSpreadsheetTimeZone('America/Los_Angeles');
  const report = plain(staff.runSetup_({}));
  assert.ok(report.notes.some((n) => /time zone is America\/Los_Angeles/.test(n)), report.notes.join(' | '));
});

test('T1: stock in adds one row and raises the stock', () => {
  const { staff, ss } = seeded();
  const sheet = ss.getSheetByName('Stock In');
  const rowsBefore = sheet.getLastRow();
  const before = ok(api(staff, 'item', { id: 'BEANS-01' })).item.stock;
  const today = ok(api(staff, 'bootstrap')).today;

  const out = ok(api(staff, 'stockIn', { itemId: 'BEANS-01', qty: 24, expiry: staff.Logic.addDays(today, 30), source: 'Donation' }));
  assert.equal(out.item.stock, before + 24);
  assert.match(out.message, /24 tins of Canned baked beans in/);
  assert.equal(sheet.getLastRow(), rowsBefore + 1);
  const row = sheet.getRange(sheet.getLastRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
  assert.equal(row[headerIndex(sheet, 'Item') - 1], 'Canned baked beans');
  assert.equal(row[headerIndex(sheet, 'Quantity') - 1], 24);
  assert.equal(row[headerIndex(sheet, 'Recorded by') - 1], 'tester@example.org');
  assert.match(row[headerIndex(sheet, 'Batch ID') - 1], /^B\d{6}-\d{6}-\d{2}$/);
});

test('T2: stock out takes the earliest-expiring usable batch', () => {
  const { staff } = seeded();
  const sardines = ok(api(staff, 'item', { id: 'SARDINES-01' })).item;
  assert.deepEqual(sardines.batches.map((b) => b.remaining), [24, 24]);
  const out = ok(api(staff, 'stockOut', { itemId: 'SARDINES-01', qty: 10, purpose: 'Food bank distribution', batch: 'auto' }));
  assert.equal(out.item.stock, 38);
  assert.deepEqual(out.item.batches.map((b) => b.remaining), [14, 24]);
});

test('T3: taking out more than there is is blocked, and nothing is written', () => {
  const { staff, ss } = seeded();
  const sheet = ss.getSheetByName('Stock Out');
  const rowsBefore = sheet.getLastRow();
  const rice = ok(api(staff, 'item', { id: 'RICE-01' })).item;
  assert.equal(rice.usable, 8);
  assert.equal(rice.expiredQty, 6);

  let res = api(staff, 'stockOut', { itemId: 'RICE-01', qty: 9, purpose: 'Kitchen', batch: 'auto' });
  assert.equal(res.ok, false);
  assert.match(res.fields.qty, /Only 8 bags usable/);

  const expired = rice.batches.find((b) => b.status === 'expired');
  res = api(staff, 'stockOut', { itemId: 'RICE-01', qty: 7, purpose: 'Disposed (expired or damaged)', batch: expired.key });
  assert.equal(res.ok, false);
  assert.match(res.fields.qty, /only has 6 bags left/);
  assert.equal(sheet.getLastRow(), rowsBefore);

  // Picking an older batch with no Batch ID gives it one, and the out row points at it.
  const done = ok(api(staff, 'stockOut', { itemId: 'RICE-01', qty: 6, purpose: 'Disposed (expired or damaged)', batch: expired.key }));
  assert.equal(done.item.expiredQty, 0);
  assert.equal(done.item.usable, 8);
  const outRow = sheet.getRange(sheet.getLastRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
  assert.match(outRow[headerIndex(sheet, 'Batch ID') - 1], /^B/);
});

test('T6 and T7: wishlist settings reach the public app, four fields only', () => {
  const { drive, staff } = seeded();
  const res = ok(api(staff, 'updateWishlistItem', { id: 'BEANS-01', target: 40, show: true, override: '' }));
  assert.equal(res.row.needed, 16);
  assert.equal(res.row.priority, 'Medium');
  assert.equal(res.sync.ok, true);

  const publicApp = loadApp('wishlist', drive, { user: '' });
  const data = plain(publicApp.getWishlist());
  assert.equal(data.configured, true);
  const beans = data.items.find((i) => i.name === 'Canned baked beans');
  assert.deepEqual({ needed: beans.needed, priority: beans.priority }, { needed: '16 tins', priority: 'Medium' });
  assert.match(beans.updated, /^\d{4}-\d{2}-\d{2}$/);
  data.items.forEach((it) => assert.deepEqual(Object.keys(it).sort(), ['name', 'needed', 'priority', 'updated']));
  assert.deepEqual(Object.keys(data).sort(), ['configured', 'info', 'items']);
  assert.equal(data.info.address, '(Sample) Warehouse address goes here');
  assert.equal(data.info.link, 'https://example.test/wishlist');
  assert.ok(!data.items.some((i) => i.name === 'Fresh milk (1 L)'), 'hidden items stay off the public list');

  // A page link that is not https is not passed on to donors.
  const pubId = staff.PropertiesService.getScriptProperties().getProperty('WISHLIST_SHEET_ID');
  staff.SpreadsheetApp.openById(pubId).getSheetByName('Info').getRange(8, 2).setValue('http://example.test/wishlist');
  assert.equal(plain(loadApp('wishlist', drive, { user: '' }).getWishlist()).info.link, undefined);
});

test('the dashboard lists what donors are asked for most, High first', () => {
  const { staff } = seeded();
  const dash = ok(api(staff, 'dashboard')).dashboard;
  assert.equal(dash.needs.length, 5);
  assert.ok(dash.needsTotal >= dash.needs.length);
  assert.equal(dash.needs[0].priority, 'High');
  dash.needs.forEach((n) => assert.ok(n.id && n.name && n.needed, JSON.stringify(n)));
});

test('T8: with a PIN, wrong guesses are refused and then locked out', () => {
  const { staff } = seeded();
  staff.PropertiesService.getScriptProperties().setProperty('STAFF_PIN', '246810');
  assert.equal(ok(api(staff, 'access')).pinRequired, true);
  assert.equal(api(staff, 'dashboard').code, 'pin');
  assert.equal(api(staff, 'dashboard', {}, '000000').code, 'pin');
  assert.equal(api(staff, 'dashboard', {}, '246810').ok, true);
  for (let i = 0; i < 10; i++) api(staff, 'dashboard', {}, '111111');
  assert.equal(api(staff, 'dashboard', {}, '246810').code, 'locked');
});

test('menu actions refuse to run from the web app', () => {
  const { staff } = seeded();
  assert.throws(() => staff.menuLoadMockData(), /getUi/);
  assert.throws(() => staff.menuSetPin(), /getUi/);
  assert.throws(() => staff.menuCreateWishlistSheet(), /getUi/);
});

test('T11: a renamed header works again once RQ_ColumnMap is updated', () => {
  const { staff, ss } = seeded();
  const stockIn = ss.getSheetByName('Stock In');
  const qtyCol = headerIndex(stockIn, 'Quantity');
  stockIn.getRange(1, qtyCol).setValue('Qty received');

  const broken = api(staff, 'dashboard');
  assert.equal(broken.ok, false);
  assert.equal(broken.code, 'setup');
  assert.match(broken.error, /"Quantity"/);

  const map = ss.getSheetByName('RQ_ColumnMap');
  const rows = map.getRange(2, 1, map.getLastRow() - 1, 3).getValues();
  const i = rows.findIndex((r) => r[0] === 'stockIn' && r[1] === 'qty');
  map.getRange(i + 2, 3).setValue('Qty received');

  assert.equal(ok(api(staff, 'item', { id: 'BEANS-01' })).item.stock, 24);
  const out = ok(api(staff, 'stockIn', { itemId: 'BEANS-01', qty: 6, noExpiry: true, source: 'Donation' }));
  assert.equal(out.item.stock, 30);
  assert.equal(stockIn.getRange(stockIn.getLastRow(), qtyCol).getValue(), 6);
});

test('one shared log tab with a Type column works through RQ_ColumnMap', () => {
  const staff = loadApp('staff', newDrive());
  const ss = staff.SpreadsheetApp.create('KSK single log');
  staff.SpreadsheetApp.__setActive(ss.getId());
  const log = ss.getSheets()[0].setName('Stock Log');
  log.getRange(1, 1, 4, 5).setValues([
    ['Date', 'Type', 'Item', 'Quantity', 'Expiry date'],
    ['01/10/2026', 'In', 'Rice', 10, '01/01/2027'],
    ['02/10/2026', 'Out', 'Rice', 3, ''],
    ['03/10/2026', 'In', 'Rice', 5, '01/02/2027']
  ]);

  assert.ok(plain(staff.runSetup_({})).errors.length > 0, 'no Stock In tab yet');
  const map = ss.getSheetByName('RQ_ColumnMap');
  const rows = map.getRange(2, 1, map.getLastRow() - 1, 3).getValues();
  const set = (table, field, value) => map.getRange(rows.findIndex((r) => r[0] === table && r[1] === field) + 2, 3).setValue(value);
  [['stockIn', 'In'], ['stockOut', 'Out']].forEach(([table, type]) => {
    set(table, '_tab', 'Stock Log');
    set(table, 'type', 'Type');
    set(table, '_typeValue', type);
  });
  assert.deepEqual(plain(staff.runSetup_({})).errors, []);

  const rice = ok(api(staff, 'inventory')).items.find((i) => i.name === 'Rice');
  assert.equal(rice.stock, 12);
  assert.equal(rice.unlisted, false, 'setup added Rice to RQ_Items');
  ok(api(staff, 'stockOut', { itemId: rice.id, qty: 2, purpose: 'Kitchen', batch: 'auto' }));
  const last = log.getRange(log.getLastRow(), 1, 1, 5).getValues()[0];
  assert.deepEqual([last[1], last[2], last[3]], ['Out', 'Rice', 2]);
});

test('a stock save still works when this account cannot open the public wishlist', () => {
  const { staff } = seeded();
  const id = staff.PropertiesService.getScriptProperties().getProperty('WISHLIST_SHEET_ID');
  staff.SpreadsheetApp.__deny('staff', id);
  const out = ok(api(staff, 'stockIn', { itemId: 'OATS-01', qty: 2, noExpiry: true }));
  assert.equal(out.item.stock, 12);
  assert.equal(out.sync.ok, false);
  assert.match(out.sync.skipped, /hourly/);
});

test('add item, then set it up for the wishlist', () => {
  const { staff } = seeded();
  const added = ok(api(staff, 'addItem', { name: 'Canned chickpeas', category: 'Canned food', unit: 'tins', target: '20', show: true }));
  assert.equal(added.id, 'CHICKPEA-01');
  assert.equal(api(staff, 'addItem', { name: 'canned  CHICKPEAS' }).fields.name, 'An item with this name already exists.');
  const admin = ok(api(staff, 'wishlistAdmin'));
  const row = admin.rows.find((r) => r.id === 'CHICKPEA-01');
  assert.deepEqual([row.needed, row.priority, row.listed], [20, 'High', true]);
  assert.ok(admin.preview.some((p) => p.name === 'Canned chickpeas'));
});

test('saving settings changes the expiry window', () => {
  const { staff } = seeded();
  const before = ok(api(staff, 'dashboard')).dashboard.counts.soonBatches;
  const saved = ok(api(staff, 'saveSettings', { soonDays: 30, highBelowPercent: 40 }));
  assert.equal(saved.settings.soonDays, 30);
  assert.equal(saved.settings.highBelow, 0.4);
  assert.ok(ok(api(staff, 'dashboard')).dashboard.counts.soonBatches > before);
  assert.ok(api(staff, 'saveSettings', { soonDays: 0, highBelowPercent: 40 }).fields.soonDays);
});
