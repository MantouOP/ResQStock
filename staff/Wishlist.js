/**
 * Copies the donor wishlist into the separate public spreadsheet.
 *
 * The public web app can only read that spreadsheet, and it only ever holds
 * four columns: item name, quantity needed, priority and last updated.
 */

function syncWishlist_(state) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CONFIG.PROPS.wishlistId);
  if (!id) {
    return { ok: false, skipped: 'There is no public wishlist spreadsheet yet. An admin can create one from the ResQStock menu in the sheet.' };
  }
  var pub;
  try {
    pub = SpreadsheetApp.openById(id);
  } catch (e) {
    // Usually: this staff member's account cannot edit the public copy. The hourly sync will catch up.
    return { ok: false, skipped: 'Could not open the public wishlist spreadsheet from this account. It will update at the next hourly sync.' };
  }
  state = state || loadState_();
  var tz = state.tz;
  var sheet = pub.getSheetByName(CONFIG.PUBLIC.tab) || pub.insertSheet(CONFIG.PUBLIC.tab);
  var now = nowStamp_(tz);
  var rows = Logic.buildPublicWishlist(state.inventory.items, state.settings.highBelow, readPublicRows_(sheet, tz), now);
  var values = [CONFIG.PUBLIC.headers].concat(rows.map(function (r) {
    return [r.name, r.needed, r.priority, stampToDate_(r.updated, tz)];
  }));
  sheet.clearContents();
  sheet.getRange(1, 1, values.length, CONFIG.PUBLIC.headers.length).setValues(values);
  props.setProperty(CONFIG.PROPS.lastSync, now);
  return { ok: true, count: rows.length, at: now };
}

/** Never lets a wishlist problem undo a stock save that already happened. */
function trySyncWishlist_(state) {
  try {
    return syncWishlist_(state);
  } catch (e) {
    console.warn('Wishlist sync failed: ' + (e && e.stack ? e.stack : e));
    return { ok: false, skipped: 'The donor wishlist did not update: ' + (e && e.message ? e.message : e) };
  }
}

function readPublicRows_(sheet, tz) {
  if (sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.PUBLIC.headers.length).getValues();
  return values
    .filter(function (r) { return Logic.cleanText(r[0]); })
    .map(function (r) {
      return {
        name: Logic.cleanText(r[0]),
        needed: Logic.cleanText(r[1]),
        priority: Logic.normPriority(r[2]),
        updated: isDate_(r[3]) ? Utilities.formatDate(r[3], tz, "yyyy-MM-dd'T'HH:mm:ss") : Logic.cleanText(r[3])
      };
    });
}

/** Creates the public spreadsheet with its Wishlist and Info tabs. */
function createWishlistSpreadsheet_() {
  var pub = SpreadsheetApp.create(CONFIG.PUBLIC.title);
  var sheet = pub.getSheets()[0];
  sheet.setName(CONFIG.PUBLIC.tab);
  sheet.getRange(1, 1, 1, CONFIG.PUBLIC.headers.length).setValues([CONFIG.PUBLIC.headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  var info = pub.insertSheet(CONFIG.PUBLIC.infoTab);
  info.getRange(1, 1, 1, 2).setValues([['Field', 'Text shown to donors']]).setFontWeight('bold');
  info.getRange(2, 1, CONFIG.PUBLIC.infoRows.length, 2).setValues(CONFIG.PUBLIC.infoRows);
  info.setFrozenRows(1);
  PropertiesService.getScriptProperties().setProperty(CONFIG.PROPS.wishlistId, pub.getId());
  return pub;
}

/** Run by the hourly trigger that an admin turns on from the ResQStock menu. */
function hourlyWishlistSync() {
  var result = trySyncWishlist_();
  console.log('Hourly wishlist sync: ' + JSON.stringify(result));
}
