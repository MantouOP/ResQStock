'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { newDrive, loadApp, api, plain } = require('./harness');
function fixture() {
  const ctx = loadApp('staff', newDrive(), { seed: true });
  ctx.__rqSeedPreview({ baseUrl: 'https://example.test/' });
  const ss = ctx.SpreadsheetApp.getActiveSpreadsheet();
  const today = api(ctx, 'bootstrap').data.today;
  const row = { name: 'Canned baked beans', qty: 3, unit: 'tins', category: '', received: today, noExpiry: true, expiry: '', source: 'Donation' };
  return { ctx, ss, row, request: { id: 'import-test-123456', rows: [row], reviewed: true, source: 'test.csv' } };
}
function ok(result) { assert.equal(result.ok, true, result.error); return result.data; }
test('import preview is read-only; commit adds existing and hidden new items', () => {
  const { ctx, ss, row, request } = fixture();
  request.rows.push({ ...row, name: 'Test lentils', unit: 'bags', qty: 2 });
  const before = ss.getSheetByName('Stock In').getLastRow();
  const beansBefore = ok(api(ctx, 'item', { id: 'BEANS-01' })).item.stock;
  const preview = ok(api(ctx, 'previewImport', request));
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.rows.map(r => r.match), ['existing', 'new']);
  assert.equal(ss.getSheetByName('Stock In').getLastRow(), before);
  const saved = ok(api(ctx, 'commitImport', request));
  assert.equal(saved.count, 2);
  assert.equal(saved.newItems, 1);
  assert.equal(ss.getSheetByName('Stock In').getLastRow(), before + 2);
  const item = plain(ctx.readItems_(ss)).find(r => r.name === 'Test lentils');
  assert.equal(item.show, false);
  assert.equal(ok(api(ctx, 'item', { id: 'BEANS-01' })).item.stock, beansBefore + 3);
});
test('every row is validated before any item or stock write', () => {
  for (const bad of [{ qty: 0 }, { qty: '1e2' }, { qty: 0.001 }, { qty: 0.0001 }, { unit: 'kg' }, { name: '=IMPORTXML("x")' }, { source: '+SUM(A1)' }, { received: '2099-01-01' }, { expiry: '', noExpiry: false }]) {
    const { ctx, ss, row, request } = fixture();
    request.rows = [{ ...row, name: 'Brand new item' }, { ...row, ...bad }];
    const before = ss.getSheetByName('Stock In').getLastRow();
    const itemsBefore = ss.getSheetByName('RQ_Items').getLastRow();
    const res = api(ctx, 'commitImport', request);
    assert.equal(res.ok, false, JSON.stringify(bad));
    assert.equal(res.code, 'invalid');
    assert.equal(ss.getSheetByName('Stock In').getLastRow(), before);
    assert.equal(ss.getSheetByName('RQ_Items').getLastRow(), itemsBefore);
  }
});
test('conflicting new-item units and unreviewed or oversized imports are blocked', () => {
  const { ctx, row, request } = fixture();
  assert.equal(api(ctx, 'commitImport', { ...request, reviewed: false }).ok, false);
  assert.equal(api(ctx, 'previewImport', { rows: Array(201).fill(row) }).ok, false);
  const res = ok(api(ctx, 'previewImport', { rows: [{ ...row, name: 'New' }, { ...row, name: 'new', unit: 'bags' }] }));
  assert.equal(res.valid, false);
  assert.ok(res.rows[1].errors.unit);
});
test('calendar overflow and trailing text cannot become shifted import dates', () => {
  const { ctx, request, row } = fixture();
  for (const fields of [{ received: '2026-02-31' }, { noExpiry: false, expiry: '2027-02-30' }, { noExpiry: false, expiry: '2027-01-01 junk' }]) {
    assert.equal(api(ctx, 'commitImport', { ...request, rows: [{ ...row, ...fields }] }).code, 'invalid');
  }
});
test('access protection applies to preview, commit and Sheets reads', () => {
  const { ctx, request } = fixture();
  ctx.PropertiesService.getScriptProperties().setProperty(ctx.CONFIG.PROPS.pin, '1234');
  for (const action of ['previewImport', 'commitImport', 'readImportSheet']) assert.equal(api(ctx, action, request).code, 'pin');
});
test('same request retry is stable; changed request token and duplicate content are blocked', () => {
  const { ctx, ss, request } = fixture();
  const first = ok(api(ctx, 'commitImport', request));
  const count = ss.getSheetByName('Stock In').getLastRow();
  assert.deepEqual(ok(api(ctx, 'commitImport', request)), first);
  assert.equal(ss.getSheetByName('Stock In').getLastRow(), count);
  assert.equal(api(ctx, 'commitImport', { ...request, rows: [{ ...request.rows[0], qty: 9 }] }).code, 'conflict');
  const duplicate = { ...request, id: 'import-test-654321', source: 'renamed.csv' };
  assert.equal(api(ctx, 'commitImport', duplicate).code, 'duplicate');
  assert.ok(ok(api(ctx, 'previewImport', duplicate)).warnings.length);
  ok(api(ctx, 'commitImport', { ...duplicate, allowDuplicate: true }));
  assert.equal(ss.getSheetByName('Stock In').getLastRow(), count + 1);
});
test('identical lines require an explicit duplicate override', () => {
  const { ctx, request, row } = fixture();
  request.rows = [row, { ...row }];
  assert.equal(api(ctx, 'commitImport', request).code, 'duplicate');
  assert.equal(ok(api(ctx, 'commitImport', { ...request, allowDuplicate: true })).count, 2);
});
test('lost finalization response recovers the existing stock write', () => {
  const { ctx, ss, request } = fixture();
  const original = ctx.saveImportJournal_;
  let fail = true;
  ctx.saveImportJournal_ = function(sheet, row, data) {
    if (data.status === 'complete' && fail) { fail = false; throw new Error('simulated journal outage'); }
    return original(sheet, row, data);
  };
  assert.equal(api(ctx, 'commitImport', request).ok, false);
  const count = ss.getSheetByName('Stock In').getLastRow();
  const saved = ok(api(ctx, 'commitImport', request));
  assert.equal(saved.count, 1);
  assert.equal(ss.getSheetByName('Stock In').getLastRow(), count);
  assert.deepEqual(ok(api(ctx, 'commitImport', request)), saved);
});
test('failed write can retry, but a conflicting or partial range fails closed', () => {
  for (const conflicting of [false, true]) {
    const { ctx, ss, request, row } = fixture();
    request.rows = [row, { ...row, name: 'New lentils' }];
    const original = ctx.writeImportStock_;
    ctx.writeImportStock_ = function() { throw new Error('simulated stock outage'); };
    assert.equal(api(ctx, 'commitImport', request).ok, false);
    const count = ss.getSheetByName('Stock In').getLastRow();
    if (conflicting) ss.getSheetByName('Stock In').appendRow(['occupied']);
    ctx.writeImportStock_ = original;
    const retried = api(ctx, 'commitImport', request);
    assert.equal(retried.ok, !conflicting);
    assert.equal(ss.getSheetByName('Stock In').getLastRow(), count + (conflicting ? 1 : 2));
    assert.equal(plain(ctx.readItems_(ss)).filter(r => r.name === 'New lentils').length, 1);
  }
});
test('a duplicate with a new token cannot bypass an unfinished import', () => {
  const { ctx, request } = fixture();
  ctx.writeImportStock_ = function() { throw new Error('simulated stock outage'); };
  api(ctx, 'commitImport', request);
  assert.equal(api(ctx, 'commitImport', { ...request, id: 'import-different-1234', allowDuplicate: true }).code, 'pending');
});
test('Sheets read accepts only a document ID and returns the selected bounded worksheet', () => {
  const { ctx } = fixture();
  assert.equal(api(ctx, 'readImportSheet', { id: 'https://evil.test' }).ok, false);
  const source = ctx.SpreadsheetApp.create('Import source');
  source.getSheets()[0].getRange(1, 1, 2, 2).setValues([['Item', 'Qty'], ['Rice', 4]]);
  // The mock IDs are short; give the fixture a real-shaped Google ID.
  const oldId = source.getId(), id = 'Abcdefghijklmnopqrstuvwxyz123456';
  ctx.__RQ_DRIVE__.files[id] = ctx.__RQ_DRIVE__.files[oldId];
  const res = ok(api(ctx, 'readImportSheet', { id, gid: '0' }));
  assert.deepEqual(res.matrix, [['Item', 'Qty'], ['Rice', '4']]);
  assert.equal(api(ctx, 'readImportSheet', { id, gid: '9999' }).ok, false);
});
test('imports honor reordered columns and a shared In/Out log', () => {
  const ctx = loadApp('staff', newDrive());
  const ss = ctx.SpreadsheetApp.create('Shared log');
  ctx.SpreadsheetApp.__setActive(ss.getId());
  const log = ss.getSheets()[0].setName('Deliveries');
  log.appendRow(['Notes', 'Quantity', 'Item', 'Date', 'Type', 'Unit', 'Expiry date']);
  ctx.runSetup_({});
  const map = ss.getSheetByName('RQ_ColumnMap');
  const rows = map.getRange(2, 1, map.getLastRow() - 1, 3).getValues();
  const set = (table, field, value) => map.getRange(rows.findIndex(r => r[0] === table && r[1] === field) + 2, 3).setValue(value);
  for (const [table, type] of [['stockIn', 'In'], ['stockOut', 'Out']]) {
    set(table, '_tab', 'Deliveries'); set(table, 'type', 'Type'); set(table, '_typeValue', type);
  }
  assert.deepEqual(plain(ctx.runSetup_({})).errors, []);
  const request = { id: 'shared-log-import-123', reviewed: true, rows: [{ name: 'Test rice', qty: 4, unit: 'bags', noExpiry: true, received: api(ctx, 'bootstrap').data.today }] };
  ok(api(ctx, 'commitImport', request));
  const saved = plain(log.getRange(2, 1, 1, 7).getValues())[0];
  assert.deepEqual([saved[0], saved[1], saved[2], saved[4], saved[5]], ['', 4, 'Test rice', 'In', 'bags']);
  assert.equal(ok(api(ctx, 'inventory')).items.find(r => r.name === 'Test rice').stock, 4);
});
