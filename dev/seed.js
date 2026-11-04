/*
 * DEVELOPMENT ONLY. Fills an empty fake Drive the way a developer would set up
 * the mock sheet with the ResQStock menu: mock data, setup check, public
 * wishlist spreadsheet, first sync. Loaded after the staff server files.
 */
function __rqSeedPreview(options) {
  options = options || {};
  if (SpreadsheetApp.getActiveSpreadsheet()) return false;

  var ss = SpreadsheetApp.create('KSK stock (mock data)');
  SpreadsheetApp.__setActive(ss.getId());
  var loaded = loadMockData_(ss);
  if (!loaded.ok) throw new Error(loaded.reason);
  runSetup_({});

  var pub = createWishlistSpreadsheet_();
  PropertiesService.__forApp('wishlist').setProperty('WISHLIST_SHEET_ID', pub.getId());
  var info = pub.getSheetByName('Info');
  info.getRange(5, 2, 3, 1).setValues([
    ['(Sample) Warehouse address goes here'],
    ['(Sample) Monday to Saturday, 9 am to 5 pm'],
    ['(Sample) WhatsApp number goes here']
  ]);

  if (options.baseUrl) {
    writeSetting_(ss, 'staff_app_url', options.baseUrl);
    writeSetting_(ss, 'wishlist_page_url', options.baseUrl + 'wishlist');
    info.getRange(8, 2).setValue(options.baseUrl + 'wishlist');
  }
  syncWishlist_();
  return true;
}
