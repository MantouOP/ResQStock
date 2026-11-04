/**
 * Fake data for the mock sheet. Development and testing only: the setup menu
 * refuses to load it into a sheet that already has stock records.
 * Dates are relative to `today`, so the expiry alerts always look realistic.
 */
var MockData = (function () {
  'use strict';

  // [id, name, category, unit, target, show on wishlist]
  var ITEMS = [
    ['RICE-01', 'White rice (5 kg)', 'Dry goods', 'bags', 40, true],
    ['OIL-01', 'Cooking oil (2 L)', 'Dry goods', 'bottles', 30, true],
    ['SARDINES-01', 'Canned sardines', 'Canned food', 'tins', 60, true],
    ['BEANS-01', 'Canned baked beans', 'Canned food', 'tins', 48, true],
    ['MILK-01', 'Fresh milk (1 L)', 'Dairy', 'cartons', 24, false],
    ['UHTMILK-01', 'UHT milk (1 L)', 'Dairy', 'cartons', 36, true],
    ['BREAD-01', 'Wholemeal bread', 'Bakery', 'loaves', 20, false],
    ['NOODLES-01', 'Instant noodles', 'Dry goods', 'packs', 100, true],
    ['PASTA-01', 'Pasta (fusilli)', 'Dry goods', 'packs', 30, true],
    ['FLOUR-01', 'Wheat flour (1 kg)', 'Dry goods', 'packs', 20, false],
    ['KAYA-01', 'Kaya spread', 'Spreads', 'jars', 12, false],
    ['SUGAR-01', 'Sugar (1 kg)', 'Dry goods', 'packs', 20, true],
    ['OATS-01', 'Rolled oats', 'Dry goods', 'packs', 15, false],
    ['SOAP-01', 'Bath soap', 'Toiletries', 'bars', 50, true],
    ['TOOTH-01', 'Toothpaste', 'Toiletries', 'tubes', 30, true],
    ['WATER-01', 'Mineral water (1.5 L)', 'Beverages', 'bottles', 48, false]
  ];

  // [days ago received, item id, qty, expiry in days from today (null = no date), source]
  var STOCK_IN = [
    [40, 'RICE-01', 10, -2, 'Donation'],
    [12, 'RICE-01', 8, 300, 'Purchase'],
    [20, 'OIL-01', 6, 240, 'Donation'],
    [15, 'SARDINES-01', 30, 7, 'Food rescue'],
    [5, 'SARDINES-01', 24, 400, 'Donation'],
    [10, 'BEANS-01', 24, 20, 'Donation'],
    [3, 'MILK-01', 12, 5, 'Food rescue'],
    [9, 'UHTMILK-01', 18, 60, 'Donation'],
    [1, 'BREAD-01', 10, 3, 'Food rescue'],
    [30, 'NOODLES-01', 60, 150, 'Donation'],
    [8, 'PASTA-01', 15, 355, 'Donation'],
    [90, 'FLOUR-01', 6, -30, 'Donation'],
    [14, 'KAYA-01', 15, 120, 'Donation'],
    [25, 'SUGAR-01', 12, 200, 'Purchase'],
    [6, 'OATS-01', 10, 12, 'Donation'],
    [45, 'SOAP-01', 40, null, 'Donation'],
    [18, 'TOOTH-01', 20, 500, 'Donation'],
    [4, 'WATER-01', 48, 365, 'Purchase']
  ];

  // [days ago, item id, qty, purpose]
  var STOCK_OUT = [
    [10, 'SARDINES-01', 6, 'Food bank distribution'],
    [7, 'NOODLES-01', 20, 'Kitchen'],
    [6, 'OIL-01', 2, 'Kitchen'],
    [5, 'SOAP-01', 12, 'Food bank distribution'],
    [3, 'UHTMILK-01', 6, 'Food bank distribution'],
    [2, 'RICE-01', 4, 'Kitchen'],
    [2, 'WATER-01', 12, 'Food bank distribution'],
    [1, 'SUGAR-01', 4, 'Kitchen']
  ];

  function itemById(id) {
    var hit = null;
    ITEMS.forEach(function (it) { if (it[0] === id) hit = it; });
    return hit;
  }

  function build(today) {
    var items = ITEMS.map(function (it) {
      return { id: it[0], name: it[1], category: it[2], unit: it[3], target: it[4], show: it[5], override: '' };
    });
    var stockIn = STOCK_IN.map(function (r) {
      var it = itemById(r[1]);
      return {
        date: Logic.addDays(today, -r[0]),
        item: it[1],
        category: it[2],
        qty: r[2],
        unit: it[3],
        expiry: r[3] === null ? '' : Logic.addDays(today, r[3]),
        source: r[4],
        recordedBy: 'mock data'
      };
    });
    var stockOut = STOCK_OUT.map(function (r) {
      var it = itemById(r[1]);
      return { date: Logic.addDays(today, -r[0]), item: it[1], qty: r[2], purpose: r[3], recordedBy: 'mock data' };
    });
    // Oldest first, like a real log.
    stockIn.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    stockOut.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return { items: items, stockIn: stockIn, stockOut: stockOut };
  }

  return { build: build };
})();
