# ResQStock

Expiry alerts and a live donor wishlist for **Kechara Soup Kitchen (KSK)**, built on top of KSK's existing Google Sheet.
WIX2001 Thinking & Communication Skills SULAM project, Occurrence 10, Group 3.

- **Staff app**: scan a shelf QR, record stock in and out, and see what is expiring. Phones and tablets use a bottom tab bar; desktop windows (1200px and wider) use a sidebar. Widgets, inventory rows and forms reflow to their available width, with vertical scrolling when needed.
- **Donor wishlist**: a public page showing only item name, quantity needed, priority and last updated date. It works on phones, tablets and desktops.
- **Stack**: Google Sheets, Google Apps Script, HTML, CSS and JavaScript. No server to host and nothing to pay for.

## Try it now, no Google account needed

```bash
npm run preview
```

Then open http://localhost:5180 for the staff app and http://localhost:5180/wishlist for the donor page.
The preview runs the real server code against fake spreadsheets in your browser. Add `?reset=1` to the address to start again with fresh mock data.
Node.js 18 or newer is the only requirement, and there is nothing to install.

## Live demo (Vercel)

- **Staff app:** https://resqstock-gamma.vercel.app
- **Donor page:** https://resqstock-gamma.vercel.app/wishlist
- **A shelf QR link:** https://resqstock-gamma.vercel.app/?item=RICE-01

The demo runs on sample data, and every push to `main` redeploys it. It is the same preview as above, built into static files by `npm run build:demo` (see `vercel.json`).

- Each visitor gets their own sample stock data, saved only in their browser. Importing a Google Sheets link requests that source from Google; demo stock changes never write back to it.
- Every page shows a "Demo with sample data" note, so the donor page is not mistaken for a real appeal from KSK. The demo also asks search engines not to index it.
- It is for showing the app. The real system runs on Google Apps Script, as [docs/SETUP.md](docs/SETUP.md) describes.

## Run the tests

```bash
npm test
```

The tests cover stock and wishlist rules, item photos, import parsing, validation, duplicate protection, retry recovery and public Google Sheets access. See [docs/TESTING.md](docs/TESTING.md) for verification and remaining manual checks.

## Import incoming stock

Open **Inventory → Import stock**, or **More → Import stock** on a phone. Choose a file, paste spreadsheet cells, or enter a Google Sheets link. Match the headings, select the date order, correct each row, then check and confirm the included rows. Importing **adds incoming stock**, preserving existing counts and history; it never replaces the current stock count.

- **Files:** CSV, TSV, XLSX, XLS, text PDFs, scanned PDFs, JPEG/JPG, PNG and WebP. Maximum 10 MB per file, 10 PDF pages and 200 stock rows; source worksheets are limited to 1,000 rows and 60 columns. Excel files can contain up to 20 worksheets.
- **Google Sheets:** the Apps Script app reads sheets your signed-in Google account can access. The Vercel demo reads public worksheet links through `/api/sheets`. For private or unavailable sheets, export CSV/XLSX or paste selected cells; changing the sheet's sharing is unnecessary.
- **PDF/photo reading:** pinned SheetJS, PDF.js and Tesseract readers download only when needed. File processing happens in the browser; original documents are not uploaded. OCR is intended for clear printed English text and is imperfect. Prices, totals, handwriting, complex layouts and rotated photos may need correction or pasted rows. Skipped lines remain visible for review.
- **Units and expiry:** quantities support up to two decimal places, matching the stock engine. Existing items keep their category and unit. A unit mismatch blocks the row; convert quantities explicitly before importing. Blank expiry cells need an explicit “No expiry date” choice when the stock log tracks expiry. New items start hidden from donors.
- **Duplicates and retries:** repeated content and identical rows require confirmation for a separate delivery. A saved import reference is retained in the browser session during an uncertain save; **Check result / retry save** reuses it and cannot append the same import twice.

Imports add a managed `RQ_Imports` journal tab on first save. Do not edit its cells. An administrator should reconcile a partial/conflicting import against the recorded destination range before proceeding. New item metadata may have been created before a failed stock write; retry reuses it. This is not a transaction across multiple sheets. The journal stops new imports at 2,000 entries; archive it only after reconciling every pending entry and retaining a backup, because removing history also removes duplicate detection for that history. Deploy the updated `staff` Apps Script bundle for real shared stock; the Vercel site remains a browser-local demo.

## Folders

| Folder | What it is | Pushed to Apps Script? |
| --- | --- | --- |
| `staff/` | Staff app: an Apps Script project bound to KSK's sheet | Yes |
| `wishlist/` | Public donor wishlist: a standalone Apps Script project with read-only access | Yes |
| `dev/` | Local preview, fake Apps Script services, bundle script | No |
| `test/` | Automated tests (Node's built-in test runner) | No |
| `docs/` | [SETUP.md](docs/SETUP.md) for the guided setup at KSK, [TESTING.md](docs/TESTING.md) | No |

## How it fits together

```
Staff phone --> shelf QR --> Staff web app (bound to KSK's sheet) <--> KSK's Google Sheet
                                   |                                  (Stock In, Stock Out, RQ_ tabs)
                                   | copies 4 fields after each save, and hourly
                                   v
Donor phone --> donor QR --> Public wishlist app  --reads only-->  Public Wishlist spreadsheet
```

- **KSK's own tabs stay as they are.** ResQStock reads and writes them through the `RQ_ColumnMap` tab, so after the site visit only that tab changes, not the code. If KSK keeps stock in and stock out in one tab with a Type column, the column map handles that too.
- **It adds four tabs:** `RQ_Items` (item list, target levels, wishlist switches), `RQ_Settings` (expiring-soon days, priority threshold, lists), `RQ_ColumnMap`, and a hidden `RQ_Photos` (item photos).
- **Item photos:** staff take or choose a photo on the item page and crop it to a square. It is saved as a small JPEG (about 10 KB) in `RQ_Photos`, inside KSK's sheet, so no Google Drive access is needed. Phones keep a copy, so each photo downloads once. Items without a photo show their category icon. Photos never appear on the public donor page.
- **Every stock-in row is a batch** with its own expiry date. Stock goes out first expiry, first out. Expired stock is skipped for distribution and taken first for disposal.
- **The two apps are separate Apps Script projects on purpose.** The browser can call any top-level server function, so the public project contains no code that can read the inventory.

## Server files (staff/)

| File | What it does |
| --- | --- |
| `Config.js` | Default tab and header names, settings rows, Script Property keys |
| `Logic.js` | Business rules: expiry status, batches and first expiry first out, wishlist quantities and priority, validation. Pure functions, tested in Node |
| `Repo.js` | Reads and writes KSK's sheet through `RQ_ColumnMap` |
| `Api.js` | `api(action, payload, pin)`, the one function the app calls; access check and script lock |
| `Wishlist.js` | Copies the four public fields to the public spreadsheet; the hourly trigger |
| `Setup.js` | The ResQStock menu in the sheet, the setup check, mock data |
| `Mock.js` | Fake items and stock for the mock sheet (refuses to load into a sheet that has data) |
| `Web.js` | Serves the page |
| `Index.html`, `Styles.html`, `App.html` | The staff app screens |

## Development with the mock sheet (clasp)

The team builds against a mock Google Sheet with fake data, never against KSK's sheet.

1. Install clasp and sign in with your own Google account:

   ```bash
   npm install -g @google/clasp
   ```

   ```bash
   clasp login
   ```

2. Create a blank Google Sheet called "ResQStock mock". Open Extensions > Apps Script, then copy the Script ID from Project Settings.
3. Copy `staff/.clasp.json.example` to `staff/.clasp.json` and paste in the Script ID. Then push:

   ```bash
   npm run push:staff
   ```

4. Reload the sheet. Use **ResQStock > Load mock data (development only)**, then **Set up or check**.
5. In the Apps Script editor, choose Deploy > Test deployments > Web app. The `/dev` link opens the staff app with your latest code.
6. For the donor page, create a standalone project at script.google.com, put its ID in `wishlist/.clasp.json`, and run `npm run push:wishlist`. Use **ResQStock > Create the public wishlist spreadsheet** and put the ID it shows into the wishlist project's Script Properties as `WISHLIST_SHEET_ID`.

**Never commit** `.clasp.json`, `.clasprc.json`, sheet IDs, deployment links or any real KSK data. The repo is public, and `.gitignore` already covers the clasp files.

## Changes from the prototype screens

These changes follow the system plan:

- The donor wishlist no longer shows current stock. "Needed" now means the shortfall: target level minus usable stock.
- "Make a Donation" became "How to donate", which shows information only and has no form, so no donor data is collected.
- Expiry dates belong to batches, not items. An item shows its earliest batch.
- The "iventory" typo is gone.
- Items can have a photo, cropped to a square on the phone. Items without one show a category icon.
- Expired stock does not count as usable, so it raises the quantity needed on the wishlist.

## Decided at the site visit, not in code

- **Access option:** A, B or C. The code supports all three; [docs/SETUP.md](docs/SETUP.md) gives the settings for each.
- **KSK's real tab and header names:** these go into `RQ_ColumnMap` once Zi Ying has the sanitised sample.
- **Priority threshold:** High below 50% of the target. KSK can change it on the Settings screen.

## Not built (by plan priority)

- A daily email of expiring items (a "Could" feature).
- Camera scanning inside the app: the shelf QR opens with the phone's normal camera instead.
