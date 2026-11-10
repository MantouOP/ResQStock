'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('an old save response does not erase a newer pending request after navigation', async () => {
  const key = 'rq-import-pending:/';
  const storage = new Map([[key, JSON.stringify({ id: 'first-import-123', rows: [{}] })]]);
  const events = {};
  const root = { innerHTML: '', addEventListener: (name, handler) => { events[name] = handler; } };
  let resolveSave;
  const ctx = vm.createContext({
    sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    location: { pathname: '/' },
    document: { getElementById: () => root },
    window: { addEventListener() {}, removeEventListener() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../staff/ImportView.html'), 'utf8').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, ''), ctx);
  const dispose = ctx.StockImportView.mount({ esc: String, today: '2026-11-10', shell() {}, invalidate() {}, call: () => new Promise(resolve => { resolveSave = resolve; }) });
  events.click({ target: { closest: selector => selector === '[data-import]' ? { dataset: { import: 'retry-save' }, disabled: false } : null } });
  dispose();
  storage.set(key, JSON.stringify({ id: 'newer-import-456', rows: [{}] }));
  resolveSave({ id: 'first-import-123', count: 1, newItems: 0 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.parse(storage.get(key)).id, 'newer-import-456');
});
