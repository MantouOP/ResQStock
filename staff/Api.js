/**
 * The one server function the staff app calls: api(action, payload, pin).
 *
 * A single entry point keeps the callable surface small. Every action passes
 * the same access check, and every result is a plain object of strings and
 * numbers (google.script.run cannot return Date objects).
 */
function api(action, payload, pin) {
  try {
    var handlers = apiHandlers_();
    if (!Object.prototype.hasOwnProperty.call(handlers, action)) throw userError_('Unknown action: ' + action);
    if (action !== 'access') requireAccess_(pin);
    var data = handlers[action](payload || {});
    return { ok: true, data: data === undefined ? null : data };
  } catch (e) {
    if (e && e.userFacing) return { ok: false, error: e.message, fields: e.fields || null, code: e.code || '' };
    console.error('ResQStock api(' + action + ') failed: ' + (e && e.stack ? e.stack : e));
    return { ok: false, error: 'Something went wrong on the server: ' + (e && e.message ? e.message : String(e)), code: 'server' };
  }
}

function apiHandlers_() {
  return {
    access: apiAccess_,
    bootstrap: apiBootstrap_,
    dashboard: apiDashboard_,
    inventory: apiInventory_,
    item: apiItem_,
    stockIn: apiStockIn_,
    stockOut: apiStockOut_,
    addItem: apiAddItem_,
    wishlistAdmin: apiWishlistAdmin_,
    updateWishlistItem: apiUpdateWishlistItem_,
    publishWishlist: apiPublishWishlist_,
    settings: apiSettings_,
    saveSettings: apiSaveSettings_,
    labels: apiLabels_,
    photos: apiPhotos_,
    setPhoto: apiSetPhoto_,
    removePhoto: apiRemovePhoto_
  };
}

/* -------------------------------------------------------------------- */
/* Access                                                               */
/* -------------------------------------------------------------------- */

/**
 * Options A and B: Google sign-in already decided who got this far, so there
 * is nothing more to check. Option C: a staff PIN, with a lockout after
 * repeated wrong guesses.
 */
function requireAccess_(pin) {
  var stored = PropertiesService.getScriptProperties().getProperty(CONFIG.PROPS.pin);
  if (!stored) return;
  var cache = CacheService.getScriptCache();
  var fails = parseInt(cache.get('rq_pin_fails') || '0', 10);
  if (fails >= CONFIG.PIN.maxFailures) {
    throw userError_('Too many wrong PIN attempts. Wait 10 minutes, then try again.', null, 'locked');
  }
  if (String(pin || '') !== stored) {
    if (pin) cache.put('rq_pin_fails', String(fails + 1), CONFIG.PIN.lockSeconds);
    throw userError_(pin ? 'That PIN is not right.' : 'Enter the staff PIN to continue.', null, 'pin');
  }
}

function apiAccess_() {
  return {
    pinRequired: !!PropertiesService.getScriptProperties().getProperty(CONFIG.PROPS.pin),
    version: CONFIG.VERSION
  };
}

/* -------------------------------------------------------------------- */
/* Read actions                                                         */
/* -------------------------------------------------------------------- */

function apiBootstrap_() {
  var state = loadState_();
  var props = PropertiesService.getScriptProperties();
  return {
    version: CONFIG.VERSION,
    today: state.today,
    user: currentUserEmail_(),
    settings: publicSettings_(state.settings),
    categories: categoriesFor_(state),
    capabilities: capabilities_(state),
    appUrl: staffAppUrl_(state.settings),
    wishlistPageUrl: state.settings.wishlistPageUrl,
    wishlistConfigured: !!props.getProperty(CONFIG.PROPS.wishlistId),
    pinRequired: !!props.getProperty(CONFIG.PROPS.pin),
    dashboard: dashboard_(state)
  };
}

function apiDashboard_() {
  var state = loadState_();
  return { today: state.today, dashboard: dashboard_(state) };
}

/** Counts, expiry alerts and the items donors are asked for most. */
function dashboard_(state) {
  var dash = Logic.summarize(state.inventory, 5);
  var needs = Logic.buildPublicWishlist(state.inventory.items, state.settings.highBelow, [], '');
  dash.needsTotal = needs.length;
  dash.needs = needs.slice(0, 5).map(function (r) {
    var item = findItemByName_(state.inventory, r.name);
    return {
      id: item ? item.id : '', name: r.name, needed: r.needed, priority: r.priority,
      category: item ? item.category : '', photo: item ? photoVersion_(state, item.id) : ''
    };
  });
  dash.alerts.forEach(function (a) { a.photo = photoVersion_(state, a.itemId); });
  return dash;
}

function apiInventory_() {
  var state = loadState_();
  return {
    today: state.today,
    items: state.inventory.items.map(function (it) { return itemSummary_(it, state); }),
    categories: categoriesFor_(state),
    warnings: state.inventory.warnings
  };
}

function apiItem_(p) {
  var state = loadState_();
  var item = Logic.findItem(state.inventory, p.id);
  if (!item) throw userError_('This item was not found. It may have been renamed or removed.', null, 'notfound');
  return itemDetail_(item, state);
}

function apiWishlistAdmin_() {
  var state = loadState_();
  var props = PropertiesService.getScriptProperties();
  var preview = Logic.buildPublicWishlist(state.inventory.items, state.settings.highBelow, [], '');
  return {
    rows: state.inventory.items.map(function (item) { return wishlistAdminRow_(item, state); }),
    preview: preview.map(function (r) { return { name: r.name, needed: r.needed, priority: r.priority }; }),
    highBelow: state.settings.highBelow,
    wishlistConfigured: !!props.getProperty(CONFIG.PROPS.wishlistId),
    wishlistPageUrl: state.settings.wishlistPageUrl,
    lastSync: props.getProperty(CONFIG.PROPS.lastSync) || ''
  };
}

function apiSettings_() {
  var state = loadState_();
  var props = PropertiesService.getScriptProperties();
  var tables = ['stockIn', 'stockOut'].map(function (key) {
    var table = state.tables[key];
    var m = state.map[key];
    return {
      key: key,
      label: m.label,
      tab: table.sheet.getName(),
      headerRow: m.headerRow,
      fields: m.order
        .map(function (f) {
          var fd = m.fields[f];
          return { key: f, header: fd.header, found: !!table.cols[f], required: fd.required, suggest: fd.suggest };
        })
        .filter(function (f) { return f.header || f.required; })
    };
  });
  return {
    settings: publicSettings_(state.settings),
    timeZone: state.tz,
    tables: tables,
    capabilities: capabilities_(state),
    access: props.getProperty(CONFIG.PROPS.pin) ? 'pin' : 'google',
    wishlistConfigured: !!props.getProperty(CONFIG.PROPS.wishlistId),
    staffAppUrl: staffAppUrl_(state.settings),
    wishlistPageUrl: state.settings.wishlistPageUrl,
    lastSync: props.getProperty(CONFIG.PROPS.lastSync) || '',
    version: CONFIG.VERSION,
    warnings: state.inventory.warnings,
    user: currentUserEmail_()
  };
}

function apiLabels_() {
  var state = loadState_();
  return {
    appUrl: staffAppUrl_(state.settings),
    wishlistPageUrl: state.settings.wishlistPageUrl,
    items: state.inventory.items
      .filter(function (it) { return !it.unlisted; })
      .map(function (it) { return { id: it.id, name: it.name, category: it.category, unit: it.unit }; })
  };
}

/* -------------------------------------------------------------------- */
/* Write actions (each one inside the script lock)                       */
/* -------------------------------------------------------------------- */

function apiStockIn_(p) {
  return withLock_(function () {
    var state = loadState_();
    var caps = capabilities_(state);
    var item = Logic.findItem(state.inventory, p.itemId);
    if (!item) throw userError_('Choose an item first.', { item: 'Choose an item.' }, 'invalid');
    var errors = Logic.validateStockIn(p, state.today, caps.expiry);
    if (Object.keys(errors).length) throw userError_('Please check the highlighted fields.', errors, 'invalid');

    var qty = Logic.round(Logic.toNumber(p.qty));
    var table = state.tables.stockIn;
    var rec = {
      date: p.received || state.today,
      item: item.name,
      itemId: item.unlisted ? '' : item.id,
      category: item.category,
      qty: qty,
      unit: item.unit,
      expiry: caps.expiry && !p.noExpiry ? p.expiry : '',
      source: Logic.cleanText(p.source),
      recordedBy: currentUserEmail_() || 'staff app',
      batchId: table.cols.batchId ? newBatchId_(state.tz) : ''
    };
    rec.row = appendRecord_(table, rec, state.tz);
    state.raw.stockIn.push(rec);
    rebuild_(state);

    var out = itemDetail_(findItemByName_(state.inventory, item.name), state);
    out.sync = trySyncWishlist_(state);
    out.message = 'Saved: ' + Logic.formatQty(qty, item.unit) + ' of ' + item.name + ' in.';
    return out;
  });
}

function apiStockOut_(p) {
  return withLock_(function () {
    var state = loadState_();
    var caps = capabilities_(state);
    var item = Logic.findItem(state.inventory, p.itemId);
    var request = { qty: p.qty, purpose: p.purpose, batch: caps.batchIds ? p.batch : 'auto' };
    var errors = Logic.validateStockOut(request, item);
    if (!item) throw userError_('Choose an item first.', errors, 'invalid');
    if (Object.keys(errors).length) throw userError_('Please check the highlighted fields.', errors, 'invalid');

    var qty = Logic.round(Logic.toNumber(p.qty));
    var batchId = '';
    if (request.batch && request.batch !== 'auto') {
      var batch = item.openBatches.filter(function (b) { return b.key === request.batch; })[0];
      batchId = batch.batchId;
      if (!batchId) {
        // Older rows have no Batch ID yet: give this one an ID so the stock-out row can point at it.
        batchId = newBatchId_(state.tz);
        state.tables.stockIn.sheet.getRange(batch.row, state.tables.stockIn.cols.batchId).setValue(batchId);
        state.raw.stockIn.forEach(function (r) { if (r.row === batch.row) r.batchId = batchId; });
      }
    }
    var rec = {
      date: state.today,
      item: item.name,
      itemId: item.unlisted ? '' : item.id,
      qty: qty,
      batchId: batchId,
      purpose: Logic.cleanText(p.purpose),
      recordedBy: currentUserEmail_() || 'staff app'
    };
    rec.row = appendRecord_(state.tables.stockOut, rec, state.tz);
    state.raw.stockOut.push(rec);
    rebuild_(state);

    var out = itemDetail_(findItemByName_(state.inventory, item.name), state);
    out.sync = trySyncWishlist_(state);
    out.message = 'Saved: ' + Logic.formatQty(qty, item.unit) + ' of ' + item.name + ' out.';
    return out;
  });
}

function apiAddItem_(p) {
  return withLock_(function () {
    var state = loadState_();
    var name = Logic.cleanText(p.name);
    var errors = {};
    if (!name) errors.name = 'Enter the item name.';
    else if (name.length > 80) errors.name = 'Keep the name under 80 characters.';
    else if (state.raw.items.some(function (it) { return Logic.normName(it.name) === Logic.normName(name); })) {
      errors.name = 'An item with this name already exists.';
    }
    var target = blankToNull_(p.target);
    if (target !== null && !(target >= 0 && target <= 100000)) errors.target = 'Enter a number, or leave it blank.';
    if (Object.keys(errors).length) throw userError_('Please check the highlighted fields.', errors, 'invalid');

    var id = Logic.makeItemId(name, state.raw.items.map(function (it) { return it.id; }));
    appendItem_(state.ss, {
      id: id,
      name: name,
      category: Logic.cleanText(p.category),
      unit: Logic.cleanText(p.unit),
      target: target,
      show: !!p.show,
      override: ''
    });
    return { id: id, message: 'Added ' + name + '.' };
  });
}

function apiUpdateWishlistItem_(p) {
  return withLock_(function () {
    var state = loadState_();
    var item = Logic.findItem(state.inventory, p.id);
    if (!item) throw userError_('This item was not found.', null, 'notfound');
    var errors = {};
    var target = blankToNull_(p.target);
    if (target !== null && !(target >= 0 && target <= 100000)) errors.target = 'Enter a number, or leave it blank.';
    var override = Logic.normPriority(p.override);
    if (p.override && !override) errors.override = 'Choose High, Medium or Low.';
    if (Object.keys(errors).length) throw userError_('Please check the highlighted fields.', errors, 'invalid');

    if (item.unlisted) {
      // Found in the stock tabs but not in RQ_Items yet: add it there first.
      var fresh = {
        id: Logic.makeItemId(item.name, state.raw.items.map(function (it) { return it.id; })),
        name: item.name,
        category: item.category,
        unit: item.unit,
        target: target,
        show: !!p.show,
        override: override
      };
      fresh.row = appendItem_(state.ss, fresh);
      state.raw.items.push(fresh);
    } else {
      updateItemRow_(state.ss, item.row, { target: target, show: !!p.show, override: override });
      state.raw.items.forEach(function (it) {
        if (it.row === item.row) { it.target = target; it.show = !!p.show; it.override = override; }
      });
    }
    rebuild_(state);
    return {
      row: wishlistAdminRow_(findItemByName_(state.inventory, item.name), state),
      sync: trySyncWishlist_(state)
    };
  });
}

function apiPublishWishlist_() {
  return withLock_(function () {
    return syncWishlist_(loadState_());
  });
}

function apiSaveSettings_(p) {
  return withLock_(function () {
    var errors = {};
    var days = Logic.toNumber(p.soonDays);
    if (!(days >= 1 && days <= 90 && Math.round(days) === days)) errors.soonDays = 'Enter a whole number of days from 1 to 90.';
    var pct = Logic.toNumber(p.highBelowPercent);
    if (!(pct >= 5 && pct <= 100)) errors.highBelowPercent = 'Enter a percentage from 5 to 100.';
    if (Object.keys(errors).length) throw userError_('Please check the highlighted fields.', errors, 'invalid');

    var ss = getSpreadsheet_();
    writeSetting_(ss, 'expiring_soon_days', days);
    writeSetting_(ss, 'priority_high_below', pct + '%');
    var state = loadState_();
    return { settings: publicSettings_(state.settings), sync: trySyncWishlist_(state), message: 'Settings saved.' };
  });
}

/* -------------------------------------------------------------------- */
/* Item photos                                                          */
/* -------------------------------------------------------------------- */

/** The images for the IDs a page needs. Lists only carry a version, so phones fetch each photo once. */
function apiPhotos_(p) {
  var ids = Array.isArray(p.ids) ? p.ids.slice(0, 200).map(String) : [];
  return { photos: ids.length ? readPhotos_(getSpreadsheet_(), ids) : {} };
}

function apiSetPhoto_(p) {
  return withLock_(function () {
    var state = loadState_();
    var item = Logic.findItem(state.inventory, p.id);
    if (!item) throw userError_('This item was not found.', null, 'notfound');
    if (item.unlisted) throw userError_('Add this item to the item list first (ResQStock > Set up or check), then add its photo.', null, 'invalid');
    var data = String(p.dataUrl || '');
    if (!PHOTO_PATTERN_.test(data)) throw userError_('That file is not a photo ResQStock can save. Use a JPG or PNG.', null, 'invalid');
    if (data.length > CONFIG.PHOTO.maxChars) throw userError_('That photo is too large to save. Zoom in a little or try another photo.', null, 'invalid');
    var version = writePhoto_(state.ss, item.id, data, state.tz);
    return { id: item.id, photo: version, message: 'Photo saved for ' + item.name + '.' };
  });
}

function apiRemovePhoto_(p) {
  return withLock_(function () {
    var state = loadState_();
    var item = Logic.findItem(state.inventory, p.id);
    if (!item) throw userError_('This item was not found.', null, 'notfound');
    deletePhoto_(state.ss, item.id);
    return { id: item.id, photo: '', message: 'Photo removed from ' + item.name + '.' };
  });
}

function photoVersion_(state, id) {
  var hit = id && state.photoIndex ? state.photoIndex[String(id).toUpperCase()] : null;
  return hit ? hit.version : '';
}

/* -------------------------------------------------------------------- */
/* Shapes sent to the browser                                           */
/* -------------------------------------------------------------------- */

function itemSummary_(item, state) {
  return {
    id: item.id,
    photo: photoVersion_(state, item.id),
    name: item.name,
    category: item.category,
    unit: item.unit,
    stock: item.stock,
    usable: item.usable,
    expiredQty: item.expiredQty,
    soonQty: item.soonQty,
    status: item.status,
    nearestExpiry: item.nearestExpiry,
    daysToNearest: item.daysToNearest,
    unlisted: item.unlisted,
    target: item.target
  };
}

function itemDetail_(item, state) {
  var w = Logic.wishlistEntry(item, state.settings.highBelow);
  var detail = itemSummary_(item, state);
  detail.batches = item.openBatches;
  detail.history = item.history.slice(0, 15);
  detail.suggestedBatch = item.suggestedBatch;
  detail.deficit = item.deficit;
  detail.wishlist = { listed: w.listed, needed: w.needed, priority: w.priority, reason: w.reason, show: item.show, target: item.target };
  return { item: detail, capabilities: capabilities_(state), today: state.today };
}

function wishlistAdminRow_(item, state) {
  var w = Logic.wishlistEntry(item, state.settings.highBelow);
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    category: item.category,
    usable: item.usable,
    stock: item.stock,
    target: item.target,
    show: item.show,
    override: item.override,
    unlisted: item.unlisted,
    needed: w.needed,
    computedPriority: w.computedPriority,
    priority: w.priority,
    listed: w.listed,
    reason: w.reason
  };
}

function publicSettings_(s) {
  return { soonDays: s.soonDays, highBelow: s.highBelow, sources: s.sources, purposes: s.purposes, categories: s.categories };
}

/** Categories from RQ_Settings first, then any others found on items. */
function categoriesFor_(state) {
  var seen = {};
  var out = [];
  state.settings.categories.concat(state.inventory.items.map(function (it) { return it.category; })).forEach(function (c) {
    var key = Logic.normName(c);
    if (key && !seen[key]) { seen[key] = true; out.push(c); }
  });
  return out;
}

function staffAppUrl_(settings) {
  if (settings.staffAppUrl) return settings.staffAppUrl;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function findItemByName_(inventory, name) {
  var want = Logic.normName(name);
  return inventory.items.filter(function (it) { return Logic.normName(it.name) === want; })[0] || null;
}

function blankToNull_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var n = Logic.toNumber(value);
  return n === null ? NaN : n;
}
