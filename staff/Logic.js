/**
 * ResQStock business rules.
 *
 * Pure functions only: nothing here touches Apps Script services, so the same
 * file runs in Apps Script, in the browser preview and in the Node tests.
 * Dates are ISO day strings ('2026-11-04'). Quantities are plain numbers.
 * Everything sits inside one object so the browser cannot call these
 * functions through google.script.run.
 */
var Logic = (function () {
  'use strict';

  var DAY_MS = 86400000;
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  var STATUS = { EXPIRED: 'expired', SOON: 'soon', SAFE: 'safe', NODATE: 'nodate', OUT: 'out' };
  /** Higher = needs attention sooner. An item shows its worst batch. */
  var STATUS_RANK = { out: 0, safe: 1, nodate: 2, soon: 3, expired: 4 };
  var STATUS_LABEL = { expired: 'Expired', soon: 'Expiring soon', safe: 'Safe', nodate: 'No date', out: 'Out of stock' };
  var PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function round(n) { return Math.round(n * 100) / 100; }

  function cleanText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function normName(value) { return cleanText(value).toLowerCase(); }

  function toNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (value === null || value === undefined) return null;
    var match = /-?\d+(\.\d+)?/.exec(String(value).replace(/,/g, ''));
    return match ? parseFloat(match[0]) : null;
  }

  function toBool(value) {
    if (value === true) return true;
    var s = normName(value);
    return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'show';
  }

  function normPriority(value) {
    var s = normName(value);
    if (s === 'high') return 'High';
    if (s === 'medium' || s === 'med') return 'Medium';
    if (s === 'low') return 'Low';
    return '';
  }

  /** Splits "a, b\n c" into ['a', 'b', 'c']. */
  function listOf(value) {
    return String(value === null || value === undefined ? '' : value)
      .split(/[,\n;]/)
      .map(cleanText)
      .filter(function (s) { return s; });
  }

  function isDisposal(purpose) { return /dispos|discard|waste/i.test(String(purpose || '')); }

  /* ------------------------------------------------------------------ */
  /* Dates                                                               */
  /* ------------------------------------------------------------------ */

  function isoFromParts(y, m, d) {
    if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    var t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return '';
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function fullYear(y) { return y < 100 ? 2000 + y : y; }

  /** ISO day -> whole days since 1970-01-01, or null. */
  function dayNumber(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
  }

  function isoFromDayNumber(n) {
    var t = new Date(n * DAY_MS);
    return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
  }

  function addDays(iso, days) {
    var n = dayNumber(iso);
    return n === null ? '' : isoFromDayNumber(n + days);
  }

  function daysBetween(fromIso, toIso) {
    var a = dayNumber(fromIso), b = dayNumber(toIso);
    return a === null || b === null ? null : b - a;
  }

  /**
   * Reads the date formats people type into a sheet. Day first, as used in
   * Malaysia: 05/11/2026 is 5 November. Returns an ISO day or ''.
   */
  function parseDay(value) {
    if (value === null || value === undefined || typeof value === 'number') return '';
    var s = cleanText(value);
    if (!s) return '';
    var m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s].*)?$/.exec(s))) return isoFromParts(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/.exec(s))) return isoFromParts(fullYear(+m[3]), +m[2], +m[1]);
    if ((m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{2,4})$/.exec(s))) {
      var mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
      return mo ? isoFromParts(fullYear(+m[3]), mo, +m[1]) : '';
    }
    if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/.exec(s))) {
      var mo2 = MONTHS[m[1].slice(0, 3).toLowerCase()];
      return mo2 ? isoFromParts(fullYear(+m[3]), mo2, +m[2]) : '';
    }
    return '';
  }

  /* ------------------------------------------------------------------ */
  /* Expiry                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Plan rule 3. Expired: before today. Expiring soon: today up to
   * today + soonDays. Safe: later. No date: blank.
   */
  function expiryStatus(expiryIso, todayIso, soonDays) {
    var e = dayNumber(expiryIso);
    if (e === null) return STATUS.NODATE;
    var t = dayNumber(todayIso);
    if (t === null) throw new Error('expiryStatus needs today as an ISO day');
    if (e < t) return STATUS.EXPIRED;
    if (e <= t + soonDays) return STATUS.SOON;
    return STATUS.SAFE;
  }

  function worstStatus(statuses) {
    var worst = STATUS.OUT;
    statuses.forEach(function (s) { if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s; });
    return worst;
  }

  /** First expiry first out: dated batches by expiry, undated last, then by arrival. */
  function sortFefo(batches) {
    return batches.sort(function (a, b) {
      var ea = a.expiryDay === null ? Infinity : a.expiryDay;
      var eb = b.expiryDay === null ? Infinity : b.expiryDay;
      if (ea !== eb) return ea < eb ? -1 : 1;
      return a.seq - b.seq;
    });
  }

  /**
   * Takes qty out of the open batches. A named batch goes first. Otherwise
   * stock that has not expired goes first, earliest expiry first; a disposal
   * takes expired stock first instead. Returns what could not be covered.
   */
  function allocate(batches, qty, eventDay, disposal, batchId) {
    var left = qty;
    function take(b) {
      var t = Math.min(b.remaining, left);
      b.remaining = round(b.remaining - t);
      left = round(left - t);
    }
    if (batchId) {
      var wanted = normName(batchId);
      batches.forEach(function (b) { if (left > 0 && b.remaining > 0 && b.batchId && normName(b.batchId) === wanted) take(b); });
    }
    if (left > 0) {
      var open = batches.filter(function (b) { return b.remaining > 0; });
      var expiredAt = function (b) { return eventDay !== null && b.expiryDay !== null && b.expiryDay < eventDay; };
      var first = sortFefo(open.filter(function (b) { return disposal ? expiredAt(b) : !expiredAt(b); }));
      var rest = sortFefo(open.filter(function (b) { return first.indexOf(b) < 0; }));
      first.concat(rest).forEach(function (b) { if (left > 0) take(b); });
    }
    return left;
  }

  /* ------------------------------------------------------------------ */
  /* Inventory                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Turns raw rows into per-item stock, batches and statuses.
   * opts = { items, stockIn, stockOut, today, soonDays }
   *   items:    [{ id, name, category, unit, target, show, override, row }]
   *   stockIn:  [{ row, date, item, itemId, category, qty, unit, expiry, source, recordedBy, batchId }]
   *   stockOut: [{ row, date, item, itemId, qty, batchId, purpose, recordedBy }]
   * Every stock-in row is one batch with its own expiry date.
   */
  function buildInventory(opts) {
    var today = opts.today;
    var soonDays = opts.soonDays;
    var todayN = dayNumber(today);
    var byName = {};
    var byId = {};
    var list = [];
    var warnings = [];

    function addItem(src, unlisted) {
      var name = cleanText(src.name);
      var item = {
        id: cleanText(src.id),
        name: name,
        category: cleanText(src.category),
        unit: cleanText(src.unit),
        target: src.target > 0 ? src.target : null,
        show: !!src.show,
        override: normPriority(src.override),
        unlisted: !!unlisted,
        row: src.row || null,
        batches: [],
        events: [],
        totalIn: 0,
        totalOut: 0,
        deficit: 0
      };
      if (!item.id) item.id = '~' + normName(name);
      byName[normName(name)] = item;
      byId[item.id.toUpperCase()] = item;
      list.push(item);
      return item;
    }

    (opts.items || []).forEach(function (it) {
      if (cleanText(it.name) && !byName[normName(it.name)]) addItem(it, false);
    });

    function resolve(r) {
      if (r.itemId) {
        var hit = byId[cleanText(r.itemId).toUpperCase()];
        if (hit) return hit;
      }
      var key = normName(r.item);
      if (!key) return null;
      return byName[key] || addItem({ name: r.item, category: r.category, unit: r.unit }, true);
    }

    var events = [];
    (opts.stockIn || []).forEach(function (r, i) {
      if (!(r.qty > 0)) return;
      var item = resolve(r);
      if (!item) return;
      if (item.unlisted) {
        if (!item.category && r.category) item.category = cleanText(r.category);
        if (!item.unit && r.unit) item.unit = cleanText(r.unit);
      }
      events.push({ kind: 'in', item: item, day: dayNumber(r.date), order: i, row: r });
    });
    (opts.stockOut || []).forEach(function (r, i) {
      if (!(r.qty > 0)) return;
      var item = resolve(r);
      if (!item) return;
      events.push({ kind: 'out', item: item, day: dayNumber(r.date), order: i, row: r });
    });

    // Chronological, stock in before stock out on the same day. Undated stock
    // in counts from the start; undated stock out is applied last.
    events.sort(function (a, b) {
      var da = a.day === null ? (a.kind === 'in' ? -Infinity : Infinity) : a.day;
      var db = b.day === null ? (b.kind === 'in' ? -Infinity : Infinity) : b.day;
      if (da !== db) return da < db ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === 'in' ? -1 : 1;
      return a.order - b.order;
    });

    events.forEach(function (ev) {
      var item = ev.item;
      var r = ev.row;
      if (ev.kind === 'in') {
        var expiry = r.expiry || '';
        item.batches.push({
          key: r.batchId ? 'id:' + r.batchId : 'row:' + r.row,
          batchId: r.batchId || '',
          row: r.row,
          received: r.date || '',
          expiry: expiry,
          expiryDay: dayNumber(expiry),
          qtyIn: r.qty,
          remaining: r.qty,
          source: r.source || '',
          seq: item.batches.length
        });
        item.totalIn = round(item.totalIn + r.qty);
        item.events.push({ kind: 'in', date: r.date || '', qty: r.qty, detail: r.source || '', expiry: expiry, by: r.recordedBy || '' });
      } else {
        var left = allocate(item.batches, r.qty, ev.day, isDisposal(r.purpose), r.batchId);
        if (left > 0) item.deficit = round(item.deficit + left);
        item.totalOut = round(item.totalOut + r.qty);
        item.events.push({ kind: 'out', date: r.date || '', qty: r.qty, detail: r.purpose || '', expiry: '', by: r.recordedBy || '' });
      }
    });

    list.forEach(function (item) {
      var open = sortFefo(item.batches.filter(function (b) { return b.remaining > 0; }));
      var stock = 0, usable = 0, expiredQty = 0, soonQty = 0;
      open.forEach(function (b) {
        b.status = expiryStatus(b.expiry, today, soonDays);
        b.daysLeft = b.expiryDay === null ? null : b.expiryDay - todayN;
        stock += b.remaining;
        if (b.status === STATUS.EXPIRED) expiredQty += b.remaining; else usable += b.remaining;
        if (b.status === STATUS.SOON) soonQty += b.remaining;
      });
      var dated = open.filter(function (b) { return b.expiryDay !== null; });
      item.stock = round(stock);
      item.usable = round(usable);
      item.expiredQty = round(expiredQty);
      item.soonQty = round(soonQty);
      item.status = open.length ? worstStatus(open.map(function (b) { return b.status; })) : STATUS.OUT;
      item.nearestExpiry = dated.length ? dated[0].expiry : '';
      item.daysToNearest = dated.length ? dated[0].daysLeft : null;
      item.openBatches = open.map(function (b) {
        return { key: b.key, batchId: b.batchId, row: b.row, received: b.received, expiry: b.expiry, qtyIn: b.qtyIn, remaining: b.remaining, status: b.status, daysLeft: b.daysLeft, source: b.source };
      });
      var suggested = open.filter(function (b) { return b.status !== STATUS.EXPIRED; })[0];
      item.suggestedBatch = suggested ? suggested.key : '';
      item.history = item.events.slice().reverse();
      if (item.deficit > 0) {
        warnings.push(item.name + ': ' + item.deficit + ' more recorded out than in. Check the stock tabs.');
      }
      delete item.batches;
      delete item.events;
    });

    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { items: list, warnings: warnings };
  }

  function findItem(inventory, id) {
    if (!id) return null;
    var want = String(id).toUpperCase();
    var hit = null;
    inventory.items.forEach(function (it) { if (!hit && it.id.toUpperCase() === want) hit = it; });
    return hit;
  }

  /** Dashboard numbers and the expiry alerts list. */
  function summarize(inventory, limit) {
    var inStock = 0, soon = 0, expired = 0, alerts = [];
    inventory.items.forEach(function (item) {
      if (item.stock > 0) inStock++;
      item.openBatches.forEach(function (b) {
        if (b.status !== STATUS.SOON && b.status !== STATUS.EXPIRED) return;
        if (b.status === STATUS.SOON) soon++; else expired++;
        alerts.push({ itemId: item.id, itemName: item.name, category: item.category, unit: item.unit, expiry: b.expiry, daysLeft: b.daysLeft, remaining: b.remaining, status: b.status });
      });
    });
    // Expiring soon first (soonest first), then expired (most recent first).
    alerts.sort(function (a, b) {
      if (a.status !== b.status) return a.status === STATUS.SOON ? -1 : 1;
      return a.status === STATUS.SOON ? a.daysLeft - b.daysLeft : b.daysLeft - a.daysLeft;
    });
    return {
      counts: { itemsInStock: inStock, soonBatches: soon, expiredBatches: expired, items: inventory.items.length },
      alerts: limit ? alerts.slice(0, limit) : alerts,
      totalAlerts: alerts.length,
      warnings: inventory.warnings
    };
  }

  /* ------------------------------------------------------------------ */
  /* Donor wishlist                                                      */
  /* ------------------------------------------------------------------ */

  function formatQty(n, unit) {
    var s = String(round(n));
    return unit ? s + ' ' + unit : s;
  }

  /**
   * Plan rules 5 to 7. Quantity needed = target - usable stock (never below 0).
   * High below highBelow x target, Medium up to the target, off the list at
   * or above it. Expired stock does not count as usable.
   */
  function wishlistEntry(item, highBelow) {
    var target = item.target > 0 ? item.target : null;
    if (!target) {
      return { needed: 0, computedPriority: '', priority: '', listed: false, reason: 'No target level set' };
    }
    var have = item.usable > 0 ? item.usable : 0;
    var needed = Math.max(0, Math.ceil(round(target - have)));
    var computed = '';
    if (needed > 0) computed = have / target < highBelow ? 'High' : 'Medium';
    var priority = needed > 0 ? (item.override || computed) : '';
    var listed = !!item.show && needed > 0;
    var reason = '';
    if (!item.show) reason = 'Hidden from donors';
    else if (needed <= 0) reason = 'At or above target';
    return { needed: needed, computedPriority: computed, priority: priority, listed: listed, reason: reason };
  }

  /**
   * Rows for the public spreadsheet: four fields, nothing else. "Last updated"
   * only moves when an item's quantity needed or priority changes.
   */
  function buildPublicWishlist(items, highBelow, previous, nowStamp) {
    var prevByName = {};
    (previous || []).forEach(function (p) { prevByName[normName(p.name)] = p; });
    var rows = [];
    items.forEach(function (item) {
      var w = wishlistEntry(item, highBelow);
      if (!w.listed) return;
      var neededText = formatQty(w.needed, item.unit);
      var prev = prevByName[normName(item.name)];
      var same = prev && String(prev.needed) === neededText && prev.priority === w.priority && prev.updated;
      rows.push({ name: item.name, needed: neededText, priority: w.priority, updated: same ? prev.updated : nowStamp });
    });
    rows.sort(function (a, b) {
      var pa = PRIORITY_RANK[a.priority], pb = PRIORITY_RANK[b.priority];
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }

  /* ------------------------------------------------------------------ */
  /* Validation                                                          */
  /* ------------------------------------------------------------------ */

  function validateStockIn(p, today, expiryTracked) {
    var errors = {};
    var qty = toNumber(p.qty);
    if (!(qty > 0)) errors.qty = 'Enter a quantity above 0.';
    else if (qty > 100000) errors.qty = 'That quantity looks too large. Check it.';
    if (expiryTracked && !p.noExpiry) {
      var e = dayNumber(p.expiry);
      if (!p.expiry) errors.expiry = 'Enter the expiry date, or tick "No expiry date".';
      else if (e === null) errors.expiry = 'Enter a valid date.';
      else if (e > dayNumber(today) + 3650) errors.expiry = 'That is more than 10 years away. Check the date.';
    }
    if (p.received) {
      var r = dayNumber(p.received);
      if (r === null) errors.received = 'Enter a valid date.';
      else if (r > dayNumber(today)) errors.received = 'The received date cannot be in the future.';
    }
    return errors;
  }

  function validateStockOut(p, item) {
    var errors = {};
    var qty = toNumber(p.qty);
    if (!item) {
      errors.item = 'Choose an item.';
      return errors;
    }
    if (!cleanText(p.purpose)) errors.purpose = 'Choose a purpose.';
    if (!(qty > 0)) {
      errors.qty = 'Enter a quantity above 0.';
      return errors;
    }
    var batchKey = p.batch && p.batch !== 'auto' ? p.batch : '';
    if (batchKey) {
      var batch = null;
      item.openBatches.forEach(function (b) { if (b.key === batchKey) batch = b; });
      if (!batch) errors.batch = 'That batch has no stock left. Pick another one.';
      else if (qty > batch.remaining) errors.qty = 'This batch only has ' + formatQty(batch.remaining, item.unit) + ' left.';
      return errors;
    }
    if (isDisposal(p.purpose)) {
      if (qty > item.stock) errors.qty = 'Only ' + formatQty(item.stock, item.unit) + ' in stock.';
    } else if (qty > item.usable) {
      errors.qty = item.expiredQty > 0
        ? 'Only ' + formatQty(item.usable, item.unit) + ' usable (' + formatQty(item.expiredQty, item.unit) + ' expired). Record expired stock with the purpose "Disposed".'
        : 'Only ' + formatQty(item.usable, item.unit) + ' in stock.';
    }
    return errors;
  }

  /* ------------------------------------------------------------------ */
  /* Settings and IDs                                                    */
  /* ------------------------------------------------------------------ */

  function parseShare(value, fallback) {
    var s = cleanText(value);
    var n = toNumber(s);
    if (n === null) return fallback;
    if (s.indexOf('%') >= 0 || n > 1) n = n / 100;
    return n > 0 && n <= 1 ? n : fallback;
  }

  /** rows = [[key, value], ...] from RQ_Settings. defaults = CONFIG.SETTINGS. */
  function parseSettings(rows, defaults) {
    var raw = {};
    (defaults || []).forEach(function (d) { raw[d[0]] = d[1]; });
    (rows || []).forEach(function (r) {
      var key = cleanText(r[0]);
      if (key && r[1] !== '' && r[1] !== null && r[1] !== undefined) raw[key] = r[1];
    });
    var soon = Math.round(toNumber(raw.expiring_soon_days));
    return {
      soonDays: soon >= 1 && soon <= 90 ? soon : 14,
      highBelow: parseShare(raw.priority_high_below, 0.5),
      sources: listOf(raw.stock_in_sources),
      purposes: listOf(raw.stock_out_purposes),
      categories: listOf(raw.categories),
      timeZone: cleanText(raw.time_zone),
      staffAppUrl: cleanText(raw.staff_app_url),
      wishlistPageUrl: cleanText(raw.wishlist_page_url)
    };
  }

  var GENERIC_WORDS = { canned: 1, fresh: 1, instant: 1, uht: 1, white: 1, brown: 1, wholemeal: 1, bath: 1, mineral: 1, cooking: 1, wheat: 1, the: 1, a: 1, of: 1, and: 1, kg: 1, g: 1, ml: 1, l: 1, pack: 1, packs: 1 };

  /** 'White rice (5 kg)' -> 'RICE-01', unique among existing IDs. */
  function makeItemId(name, existingIds) {
    var words = normName(name).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(function (w) { return w; });
    var word = words.filter(function (w) { return !GENERIC_WORDS[w] && !/^\d/.test(w); })[0] || words[0] || 'item';
    var base = word.toUpperCase().slice(0, 8);
    var taken = {};
    (existingIds || []).forEach(function (id) { taken[String(id).toUpperCase()] = true; });
    for (var n = 1; n < 1000; n++) {
      var id = base + '-' + pad2(n);
      if (!taken[id]) return id;
    }
    return base + '-' + new Date().getTime();
  }

  return {
    STATUS: STATUS,
    STATUS_LABEL: STATUS_LABEL,
    PRIORITIES: ['High', 'Medium', 'Low'],
    round: round,
    cleanText: cleanText,
    normName: normName,
    toNumber: toNumber,
    toBool: toBool,
    normPriority: normPriority,
    listOf: listOf,
    isDisposal: isDisposal,
    dayNumber: dayNumber,
    isoFromDayNumber: isoFromDayNumber,
    addDays: addDays,
    daysBetween: daysBetween,
    parseDay: parseDay,
    expiryStatus: expiryStatus,
    worstStatus: worstStatus,
    buildInventory: buildInventory,
    findItem: findItem,
    summarize: summarize,
    formatQty: formatQty,
    wishlistEntry: wishlistEntry,
    buildPublicWishlist: buildPublicWishlist,
    validateStockIn: validateStockIn,
    validateStockOut: validateStockOut,
    parseShare: parseShare,
    parseSettings: parseSettings,
    makeItemId: makeItemId
  };
})();

// Node tests load this file with require(); Apps Script has no `module`.
if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
