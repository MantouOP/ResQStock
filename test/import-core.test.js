'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../staff/ImportCore.html'), 'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g, '');
const core = vm.runInNewContext(source + '\nImportCore;', { URL, URLSearchParams });
const plain = value => JSON.parse(JSON.stringify(value));

test('import CSV preserves quoted commas, escaped quotes, embedded newlines and BOM', () => {
  const rows = core.parseDelimited('\uFEFFItem,Quantity,Unit\r\n"Rice, white",12,bags\r\n"Soap ""fresh""\nlarge",4,bars\r\n');
  assert.deepEqual(plain(rows), [['Item','Quantity','Unit'],['Rice, white','12','bags'],['Soap "fresh"\nlarge','4','bars']]);
});

test('import detects pasted tabs and semicolon CSV without splitting quoted delimiters', () => {
  assert.deepEqual(plain(core.parseDelimited('Item\tQty\tUnit\nCanned beans\t24\ttins')), [['Item','Qty','Unit'],['Canned beans','24','tins']]);
  assert.deepEqual(plain(core.parseDelimited('Item;Qty\n"Rice; white";3')), [['Item','Qty'],['Rice; white','3']]);
});

test('malformed CSV and oversized row/column input fail explicitly instead of truncating', () => {
  assert.throws(() => core.parseDelimited('Item,Qty\n"Rice,2'), /quote/i);
  assert.throws(() => core.parseDelimited('x'.repeat(2000001)), /large|limit/i);
  assert.throws(() => core.parseDelimited(Array(62).fill('column').join(',')), /column/i);
  assert.throws(() => core.mapRows(Array.from({length:201}, () => ['Rice','2']), {headerRow:-1,mapping:{name:0,qty:1}}), /200/);
});

test('header detection finds English or Malay columns after a report title', () => {
  const detected = core.detectHeader([['November donations'],['Nama barang','Kuantiti','Unit','Tarikh luput','Kategori'],['Beras','12','bags','2027-01-01','Dry goods']]);
  assert.equal(detected.headerRow, 1);
  assert.deepEqual(plain(detected.mapping), {name:0,qty:1,unit:2,expiry:3,category:4});
});

test('mapping keeps source row numbers, defaults, and repeated headers out of stock', () => {
  const matrix = [['Stock list'],['Item','Qty','Unit','Expiry'],['Rice','2','bags','31/12/2027'],['Item','Qty','Unit','Expiry'],['Soap','4','bars','No expiry']];
  const detected = core.detectHeader(matrix);
  const rows = core.mapRows(matrix, {...detected,dateOrder:'dmy',defaults:{received:'2026-11-09',source:'Donation'}});
  assert.equal(rows.length, 2);
  assert.deepEqual(plain(rows.map(r => [r.sourceRow,r.name,r.qty,r.unit,r.expiry,r.noExpiry,r.received,r.source])), [[3,'Rice',2,'bags','2027-12-31',false,'2026-11-09','Donation'],[5,'Soap',4,'bars','',true,'2026-11-09','Donation']]);
  assert.deepEqual(plain(rows[0].errors), {});
});

test('headerless mapping preserves first item and does not invent a missing quantity or expiry choice', () => {
  const rows = core.mapRows([['Rice','2','bags'],['Soap','','bars']], {headerRow:-1,mapping:{name:0,qty:1,unit:2}});
  assert.equal(rows[0].name, 'Rice');
  assert.equal(rows[0].noExpiry, false);
  assert.match(rows[1].errors.qty, /quantity/i);
});

test('quantity conversion rejects prices, ambiguous comma decimals and nonfinite values', () => {
  for (const value of ['RM 12.50','12 pcs','1,5','Infinity','1e3','-2','0','100001']) assert.ok(core.parseQuantity(value).error, value);
  assert.equal(core.parseQuantity('1,234.5').value, 1234.5);
  assert.equal(core.parseQuantity('0.12').value, 0.12);
  assert.ok(core.parseQuantity('0.001').error);
});

test('ambiguous dates require a choice and impossible dates never roll into another month', () => {
  assert.match(core.parseDate('03/04/2027','auto').error, /day|month|ambiguous/i);
  assert.equal(core.parseDate('03/04/2027','dmy').value, '2027-04-03');
  assert.equal(core.parseDate('03/04/2027','mdy').value, '2027-03-04');
  assert.ok(core.parseDate('31/02/2027','dmy').error);
  assert.ok(core.parseDate('2027-02-29','auto').error);
  assert.equal(core.parseDate('2028-02-29','auto').value, '2028-02-29');
  assert.equal(core.parseDate('13/04/2027','auto').value, '2027-04-13');
});

test('Excel serial dates and named months become exact calendar dates', () => {
  assert.equal(core.parseDate(45292,'auto').value, '2024-01-01');
  assert.equal(core.parseDate('9 Nov 2027','auto').value, '2027-11-09');
  assert.equal(core.parseDate('9 Ogos 2027','auto').value, '2027-08-09');
});

test('document lines accept explicit quantities and units while surfacing unmatched lines', () => {
  const result = core.documentRows('Incoming stock\nCanned beans 24 tins 2027-12-31\nRice 6 bags 31/12/2027\nTotal RM 120.00\nSoap 12 bars no expiry');
  assert.deepEqual(plain(result.matrix), [['Item','Quantity','Unit','Expiry'],['Canned beans','24','tins','2027-12-31'],['Rice','6','bags','31/12/2027'],['Soap','12','bars','no expiry']]);
  assert.equal(result.unmatched.length, 2);
  assert.ok(result.unmatched.includes('Total RM 120.00'));
});

test('tabular document text stays tabular and formula-like strings stay inert', () => {
  const result = core.documentRows('Item\tQty\tUnit\n=IMPORTXML("url")\t2\tbags');
  assert.equal(result.matrix[1][0], '=IMPORTXML("url")');
  const rows = core.mapRows(result.matrix, {...core.detectHeader(result.matrix)});
  assert.equal(rows[0].name, '=IMPORTXML("url")');
});

test('Sheets links accept exact Google hosts and numeric worksheet IDs only', () => {
  const id='1AbCdefGhijklmnopQRSTuvwxYZ123456789';
  assert.deepEqual(plain(core.parseSheetUrl('https://docs.google.com/spreadsheets/d/'+id+'/edit#gid=123')), {id,gid:'123',published:false});
  assert.throws(() => core.parseSheetUrl('https://docs.google.com.attacker.test/spreadsheets/d/'+id+'/edit'), /Google Sheets/i);
  assert.throws(() => core.parseSheetUrl('http://docs.google.com/spreadsheets/d/'+id+'/edit'), /Google Sheets/i);
  assert.throws(() => core.parseSheetUrl('https://docs.google.com/spreadsheets/d/'+id+'/edit#gid=../bad'), /worksheet/i);
});
