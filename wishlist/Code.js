/**
 * ResQStock public donor wishlist.
 *
 * A standalone Apps Script project with read-only access to ONE spreadsheet:
 * the public wishlist copy that the staff app writes. It has no write code at
 * all, and getWishlist() builds every item field by field, so only item name,
 * quantity needed, priority and last updated can ever reach a donor.
 */

var WISHLIST_TAB = 'Wishlist';
var INFO_TAB = 'Info';
var INFO_KEYS = {
  'title': 'title',
  'message': 'message',
  'how to donate': 'howTo',
  'address': 'address',
  'opening hours': 'hours',
  'contact': 'contact',
  'page link': 'link'
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Donor wishlist')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** The only function donors' browsers can call. Cached for a minute. */
function getWishlist() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('wishlist_v1');
  if (hit) return JSON.parse(hit);
  var result = readWishlist_();
  cache.put('wishlist_v1', JSON.stringify(result), 60);
  return result;
}

function readWishlist_() {
  var id = PropertiesService.getScriptProperties().getProperty('WISHLIST_SHEET_ID');
  if (!id) return { configured: false, items: [], info: {} };
  var ss = SpreadsheetApp.openById(id);
  var tz = ss.getSpreadsheetTimeZone();
  var items = [];
  var sheet = ss.getSheetByName(WISHLIST_TAB);
  if (sheet && sheet.getLastRow() >= 2) {
    var values = sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), 1)).getValues();
    var head = values[0].map(norm_);
    var cName = head.indexOf('item name');
    var cNeeded = head.indexOf('quantity needed');
    var cPriority = head.indexOf('priority');
    var cUpdated = head.indexOf('last updated');
    if (cName >= 0) {
      values.slice(1, 201).forEach(function (r) {
        var name = text_(r[cName], 80);
        if (!name) return;
        items.push({
          name: name,
          needed: cNeeded >= 0 ? text_(r[cNeeded], 40) : '',
          priority: cPriority >= 0 ? priority_(r[cPriority]) : '',
          updated: cUpdated >= 0 ? day_(r[cUpdated], tz) : ''
        });
      });
    }
  }
  return { configured: true, items: items, info: readInfo_(ss) };
}

/** KSK-written text for the "How to donate" panel. Placeholder rows are skipped. */
function readInfo_(ss) {
  var info = {};
  var sheet = ss.getSheetByName(INFO_TAB);
  if (!sheet || sheet.getLastRow() < 2) return info;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var key = INFO_KEYS[norm_(r[0])];
    var value = text_(r[1], 400);
    if (key && value && !/^to be filled/i.test(value)) info[key] = value;
  });
  if (info.link && !/^https:\/\//i.test(info.link)) delete info.link;
  return info;
}

function norm_(v) { return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase(); }

function text_(v, max) {
  var s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function priority_(v) {
  var s = norm_(v);
  return s === 'high' ? 'High' : s === 'medium' ? 'Medium' : s === 'low' ? 'Low' : '';
}

function day_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? m[0] : '';
}
