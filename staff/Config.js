/**
 * ResQStock staff app: shared configuration.
 *
 * Header names below are placeholders until KSK's sanitised sheet sample
 * arrives. The real names live in the RQ_ColumnMap tab, so after the site
 * visit you change that tab, not this file.
 */
var CONFIG = {
  VERSION: '0.1.0',

  /** Tabs ResQStock adds to KSK's sheet. Everything it adds starts with RQ_. */
  TABS: {
    items: 'RQ_Items',
    settings: 'RQ_Settings',
    columnMap: 'RQ_ColumnMap',
    photos: 'RQ_Photos'
  },

  /**
   * Item photos: one small square JPEG per item, stored as text in the hidden
   * RQ_Photos tab. A Sheets cell holds at most 50,000 characters.
   */
  PHOTO: { headers: ['Item ID', 'Photo', 'Version'], maxChars: 48000 },

  /**
   * KSK's own stock tabs, with default tab and header names.
   * required: setup stops if the column is missing.
   * suggest:  setup offers to add the column at the end of the tab.
   * An empty header means "not used" until someone maps it in RQ_ColumnMap.
   */
  TABLES: {
    stockIn: {
      label: 'Stock in',
      tab: 'Stock In',
      fields: [
        { key: 'date', header: 'Date', required: true, note: 'Date the stock arrived' },
        { key: 'item', header: 'Item', required: true, note: 'Item name, matched to RQ_Items' },
        { key: 'category', header: 'Category', note: 'Optional' },
        { key: 'qty', header: 'Quantity', required: true, note: 'Number of units received' },
        { key: 'unit', header: 'Unit', note: 'Optional, e.g. tins, bags' },
        { key: 'expiry', header: 'Expiry date', suggest: true, note: 'Needed for expiry alerts' },
        { key: 'source', header: 'Source type', note: 'Donation, purchase... never a donor name' },
        { key: 'recordedBy', header: 'Recorded by', note: 'Optional' },
        { key: 'batchId', header: 'Batch ID', suggest: true, note: 'Lets staff take stock from a specific batch' },
        { key: 'itemId', header: '', note: 'Optional: a column holding RQ_Items IDs' },
        { key: 'type', header: '', note: 'Only if stock in and out share one tab' }
      ]
    },
    stockOut: {
      label: 'Stock out',
      tab: 'Stock Out',
      fields: [
        { key: 'date', header: 'Date', required: true, note: 'Date the stock went out' },
        { key: 'item', header: 'Item', required: true, note: 'Item name, matched to RQ_Items' },
        { key: 'qty', header: 'Quantity', required: true, note: 'Number of units out' },
        { key: 'batchId', header: 'Batch ID', suggest: true, note: 'Filled when staff pick a batch' },
        { key: 'purpose', header: 'Purpose', note: 'Kitchen, distribution, disposed...' },
        { key: 'recordedBy', header: 'Recorded by', note: 'Optional' },
        { key: 'itemId', header: '', note: 'Optional: a column holding RQ_Items IDs' },
        { key: 'type', header: '', note: 'Only if stock in and out share one tab' }
      ]
    }
  },

  /** Columns of RQ_Items, in order. ResQStock finds them by header, so KSK may reorder them. */
  ITEM_HEADERS: ['Item ID', 'Item name', 'Category', 'Unit', 'Target level', 'Show on wishlist', 'Priority override'],

  /** Rows of RQ_Settings: [key, default value, note]. */
  SETTINGS: [
    ['expiring_soon_days', 14, 'Days before expiry that count as Expiring Soon (1 to 90)'],
    ['priority_high_below', '50%', 'Wishlist priority is High when usable stock is below this share of the target'],
    ['stock_in_sources', 'Donation, Purchase, Food rescue, Other', 'Choices for "Source type", comma separated. Never donor names.'],
    ['stock_out_purposes', 'Kitchen, Food bank distribution, Disposed (expired or damaged), Other', 'Choices for "Purpose". A purpose containing "Dispos" takes expired stock first.'],
    ['categories', 'Canned food, Dry goods, Dairy, Bakery, Beverages, Spreads, Toiletries, Other', 'Item categories, comma separated'],
    ['time_zone', 'Asia/Kuala_Lumpur', 'Expected time zone. Setup warns if the sheet\'s own time zone (File > Settings) is different.'],
    ['staff_app_url', '', 'Paste the staff web app URL (ends in /exec) after deploying. Used for shelf QR codes.'],
    ['wishlist_page_url', '', 'Paste the public wishlist web app URL after deploying. Used for the donor QR code.']
  ],

  /** The public copy that the donor wishlist app reads. Exactly four columns. */
  PUBLIC: {
    title: 'ResQStock public donor wishlist',
    tab: 'Wishlist',
    headers: ['Item name', 'Quantity needed', 'Priority', 'Last updated'],
    infoTab: 'Info',
    infoRows: [
      ['Title', 'Help fill our pantry'],
      ['Message', 'Your donations make a difference. These are the items we need most right now.'],
      ['How to donate', 'Bring items to our warehouse during opening hours. Please check that food is within its expiry date.'],
      ['Address', 'To be filled in by KSK'],
      ['Opening hours', 'To be filled in by KSK'],
      ['Contact', 'To be filled in by KSK'],
      ['Page link', 'To be filled in by KSK']
    ]
  },

  PRIORITIES: ['High', 'Medium', 'Low'],

  /** Option C (staff PIN) only. Options A and B rely on Google sign-in instead. */
  PIN: { minLength: 6, maxFailures: 10, lockSeconds: 600 },

  /** Script Properties keys. IDs live here, never in the code repo. */
  PROPS: {
    sheetId: 'SHEET_ID',
    wishlistId: 'WISHLIST_SHEET_ID',
    pin: 'STAFF_PIN',
    lastSync: 'WISHLIST_LAST_SYNC'
  }
};
