'use strict';
/* Business rules from the plan, tested without any sheet. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../staff/Logic.js');

const TODAY = '2026-11-04';

function inventory(stockIn, stockOut, items) {
  return Logic.buildInventory({ items: items || [], stockIn, stockOut: stockOut || [], today: TODAY, soonDays: 14 });
}

function brief(w) {
  return { needed: w.needed, priority: w.priority, listed: w.listed };
}

test('dates people type into a sheet are read day first', () => {
  assert.equal(Logic.parseDay('2026-11-04'), '2026-11-04');
  assert.equal(Logic.parseDay('05/11/2026'), '2026-11-05');
  assert.equal(Logic.parseDay('5-11-26'), '2026-11-05');
  assert.equal(Logic.parseDay('5 Nov 2026'), '2026-11-05');
  assert.equal(Logic.parseDay('Nov 5, 2026'), '2026-11-05');
  assert.equal(Logic.parseDay('31/02/2026'), '');
  assert.equal(Logic.parseDay('soon'), '');
  assert.equal(Logic.parseDay(''), '');
});

test('T4: expiry status at the boundaries (expiring soon = 14 days)', () => {
  const status = (offset) => Logic.expiryStatus(Logic.addDays(TODAY, offset), TODAY, 14);
  assert.equal(status(-1), 'expired');
  assert.equal(status(0), 'soon');
  assert.equal(status(14), 'soon');
  assert.equal(status(15), 'safe');
  assert.equal(Logic.expiryStatus('', TODAY, 14), 'nodate');
});

test('T5: a 7-day window recalculates the status', () => {
  const in10days = Logic.addDays(TODAY, 10);
  assert.equal(Logic.expiryStatus(in10days, TODAY, 14), 'soon');
  assert.equal(Logic.expiryStatus(in10days, TODAY, 7), 'safe');
});

test('stock is in minus out, first expiry first out, and expired stock is not usable', () => {
  const r = inventory(
    [
      { row: 2, date: '2026-10-01', item: 'Rice', qty: 10, expiry: '2026-11-02' },
      { row: 3, date: '2026-10-20', item: 'Rice', qty: 8, expiry: '2027-06-01' }
    ],
    [{ row: 2, date: '2026-10-25', item: 'Rice', qty: 4, purpose: 'Kitchen' }]
  );
  const rice = r.items[0];
  assert.equal(rice.stock, 14);
  assert.deepEqual(rice.openBatches.map((b) => b.remaining), [6, 8]);
  assert.equal(rice.usable, 8);
  assert.equal(rice.expiredQty, 6);
  assert.equal(rice.status, 'expired');
  assert.equal(rice.suggestedBatch, 'row:3');
});

test('distribution skips expired stock, while disposal takes it first', () => {
  const stockIn = [
    { row: 2, date: '2026-10-01', item: 'Milk', qty: 5, expiry: '2026-11-01' },
    { row: 3, date: '2026-10-30', item: 'Milk', qty: 5, expiry: '2026-11-10' }
  ];
  const given = inventory(stockIn, [{ row: 2, date: TODAY, item: 'Milk', qty: 2, purpose: 'Food bank distribution' }]).items[0];
  assert.deepEqual(given.openBatches.map((b) => [b.expiry, b.remaining]), [['2026-11-01', 5], ['2026-11-10', 3]]);
  const binned = inventory(stockIn, [{ row: 2, date: TODAY, item: 'Milk', qty: 2, purpose: 'Disposed (expired or damaged)' }]).items[0];
  assert.deepEqual(binned.openBatches.map((b) => [b.expiry, b.remaining]), [['2026-11-01', 3], ['2026-11-10', 5]]);
});

test('a named batch goes first, and more out than in is flagged', () => {
  const r = inventory(
    [
      { row: 2, date: '2026-10-01', item: 'Oil', qty: 4, expiry: '2027-01-01', batchId: 'B1' },
      { row: 3, date: '2026-10-02', item: 'Oil', qty: 4, expiry: '2027-05-01', batchId: 'B2' }
    ],
    [
      { row: 2, date: '2026-10-03', item: 'Oil', qty: 3, batchId: 'B2', purpose: 'Kitchen' },
      { row: 3, date: '2026-10-04', item: 'Oil', qty: 9, purpose: 'Kitchen' }
    ]
  );
  const oil = r.items[0];
  assert.equal(oil.stock, 0);
  assert.equal(oil.status, 'out');
  assert.equal(oil.deficit, 4);
  assert.equal(r.warnings.length, 1);
});

test('names match whatever the case or spacing, and unknown names are kept', () => {
  const r = inventory(
    [
      { row: 2, date: '2026-10-01', item: '  white RICE ', qty: 3, expiry: '' },
      { row: 3, date: '2026-10-01', item: 'Soap', qty: 2, expiry: '' }
    ],
    [],
    [{ id: 'RICE-01', name: 'White rice', target: 10, show: true }]
  );
  assert.equal(Logic.findItem(r, 'rice-01').stock, 3);
  const soap = r.items.find((i) => i.name === 'Soap');
  assert.equal(soap.unlisted, true);
  assert.equal(soap.status, 'nodate');
});

test('T6: quantity needed and priority on the wishlist', () => {
  const item = (usable, extra) => Object.assign({ target: 10, usable, show: true, override: '' }, extra);
  assert.deepEqual(brief(Logic.wishlistEntry(item(4), 0.5)), { needed: 6, priority: 'High', listed: true });
  assert.deepEqual(brief(Logic.wishlistEntry(item(5), 0.5)), { needed: 5, priority: 'Medium', listed: true });
  assert.deepEqual(brief(Logic.wishlistEntry(item(7), 0.5)), { needed: 3, priority: 'Medium', listed: true });
  assert.deepEqual(brief(Logic.wishlistEntry(item(10), 0.5)), { needed: 0, priority: '', listed: false });
  assert.equal(Logic.wishlistEntry(item(4, { override: 'Low' }), 0.5).priority, 'Low');
  assert.equal(Logic.wishlistEntry(item(4, { show: false }), 0.5).listed, false);
  assert.equal(Logic.wishlistEntry(item(0, { target: null }), 0.5).listed, false);
});

test('public rows hold exactly four fields, and Last updated moves only on a change', () => {
  const items = [
    { name: 'Rice', unit: 'bags', target: 10, usable: 4, show: true, override: '' },
    { name: 'Oil', unit: '', target: 10, usable: 9, show: true, override: '' },
    { name: 'Soap', unit: 'bars', target: 10, usable: 2, show: false, override: '' }
  ];
  const first = Logic.buildPublicWishlist(items, 0.5, [], '2026-11-04T10:00:00');
  assert.deepEqual(first.map((r) => r.name), ['Rice', 'Oil']);
  first.forEach((r) => assert.deepEqual(Object.keys(r).sort(), ['name', 'needed', 'priority', 'updated']));
  assert.equal(first[0].needed, '6 bags');
  assert.equal(first[1].needed, '1');

  const same = Logic.buildPublicWishlist(items, 0.5, first, '2026-11-05T09:00:00');
  assert.equal(same[0].updated, '2026-11-04T10:00:00');

  items[0].usable = 3;
  const changed = Logic.buildPublicWishlist(items, 0.5, same, '2026-11-06T09:00:00');
  assert.equal(changed.find((r) => r.name === 'Rice').updated, '2026-11-06T09:00:00');
  assert.equal(changed.find((r) => r.name === 'Oil').updated, '2026-11-04T10:00:00');
});

test('T3: stock out cannot take more than the batch or the usable stock', () => {
  const beans = inventory([
    { row: 2, date: '2026-10-01', item: 'Beans', qty: 5, expiry: '2026-11-01' },
    { row: 3, date: '2026-10-02', item: 'Beans', qty: 10, expiry: '2027-01-01' }
  ]).items[0];
  assert.match(Logic.validateStockOut({ qty: 11, purpose: 'Kitchen', batch: 'auto' }, beans).qty, /Only 10 usable/);
  assert.deepEqual(Logic.validateStockOut({ qty: 10, purpose: 'Kitchen', batch: 'auto' }, beans), {});
  assert.deepEqual(Logic.validateStockOut({ qty: 15, purpose: 'Disposed', batch: 'auto' }, beans), {});
  assert.match(Logic.validateStockOut({ qty: 6, purpose: 'Kitchen', batch: 'row:2' }, beans).qty, /only has 5 left/);
  assert.equal(Logic.validateStockOut({ qty: 0, purpose: 'Kitchen' }, beans).qty, 'Enter a quantity above 0.');
  assert.equal(Logic.validateStockOut({ qty: 2, purpose: '' }, beans).purpose, 'Choose a purpose.');
});

test('stock in checks quantity, expiry and the received date', () => {
  assert.deepEqual(Logic.validateStockIn({ qty: 24, expiry: '2026-11-20' }, TODAY, true), {});
  assert.ok(Logic.validateStockIn({ qty: 0, expiry: '2026-11-20' }, TODAY, true).qty);
  assert.ok(Logic.validateStockIn({ qty: 5 }, TODAY, true).expiry);
  assert.deepEqual(Logic.validateStockIn({ qty: 5, noExpiry: true }, TODAY, true), {});
  assert.deepEqual(Logic.validateStockIn({ qty: 5 }, TODAY, false), {});
  assert.ok(Logic.validateStockIn({ qty: 5, noExpiry: true, received: '2026-11-05' }, TODAY, true).received);
  assert.ok(Logic.validateStockIn({ qty: 5, expiry: '2040-01-01' }, TODAY, true).expiry);
});

test('settings and item IDs', () => {
  const s = Logic.parseSettings([['expiring_soon_days', 7], ['priority_high_below', 0.4], ['categories', 'A, B']], []);
  assert.equal(s.soonDays, 7);
  assert.equal(s.highBelow, 0.4);
  assert.deepEqual(s.categories, ['A', 'B']);
  assert.equal(Logic.parseSettings([['priority_high_below', '60%']], []).highBelow, 0.6);
  assert.equal(Logic.parseSettings([['priority_high_below', 30]], []).highBelow, 0.3);
  assert.equal(Logic.parseSettings([['expiring_soon_days', 500]], []).soonDays, 14);
  assert.equal(Logic.makeItemId('White rice (5 kg)', []), 'RICE-01');
  assert.equal(Logic.makeItemId('White rice (5 kg)', ['RICE-01']), 'RICE-02');
  assert.equal(Logic.makeItemId('Canned sardines', []), 'SARDINES-01');
});
