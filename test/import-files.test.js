'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function load(extra = {}) {
  const ctx = vm.createContext({ DOMException, setTimeout, clearTimeout, URL, ...extra });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../staff/ImportFiles.html'), 'utf8').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, ''), ctx);
  return ctx.ImportFiles;
}
test('PDF text columns preserve item words and separate distant cells', () => {
  const reader = load();
  const item = (str, x, y, width) => ({ str, width, height: 10, transform: [10, 0, 0, 10, x, y] });
  assert.equal(reader.pdfText([item('Canned', 10, 30, 32), item('beans', 46, 30, 25), item('4', 200, 30, 6), item('tins', 240, 30, 18), item('Rice', 10, 10, 20)]), 'Canned beans\t4\ttins\nRice');
});
test('read rejects empty, oversized and unsupported sources before decoding', async () => {
  const reader = load();
  for (const file of [{ size: 0, name: 'empty.csv' }, { size: 11 * 1024 * 1024, name: 'big.pdf' }, { size: 10, name: 'program.exe' }]) await assert.rejects(reader.read(file));
});
test('cancel during image decoding closes a bitmap that arrives after cancellation', async () => {
  let decode, closed = 0;
  const reader = load({ createImageBitmap: () => new Promise(resolve => { decode = resolve; }) });
  const controller = new AbortController();
  const pending = reader.read({ size: 10, name: 'stock.jpg' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  decode({ width: 200, height: 100, close() { closed++; } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(closed, 1);
});
