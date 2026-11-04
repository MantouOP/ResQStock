# ResQStock

Expiry alerts and a live donor wishlist for **Kechara Soup Kitchen (KSK)**, built on top of KSK's existing Google Sheet.
WIX2001 Thinking & Communication Skills SULAM project, Occurrence 10, Group 3.

- **Staff app**: scan a shelf QR, record stock in and out, and see what is expiring. On phones it has a bottom tab bar. On a desktop (960px and wider) it has a sidebar, the inventory becomes a table, and pages use two columns.
- **Donor wishlist**: a public page showing only item name, quantity needed, priority and last updated date. It works on phones, tablets and desktops.
- **Stack**: Google Sheets, Google Apps Script, HTML, CSS and JavaScript. No server to host and nothing to pay for.

## Try it now, no Google account needed

```bash
npm run preview
```

Then open http://localhost:5180 for the staff app and http://localhost:5180/wishlist for the donor page.
The preview runs the real server code against fake spreadsheets in your browser. Add `?reset=1` to the address to start again with fresh mock data.
Node.js 18 or newer is the only requirement, and there is nothing to install.

## Run the tests

```bash
npm test
```

There are 25 tests covering the business rules and the plan's T1 to T11 scenarios. [docs/TESTING.md](docs/TESTING.md) shows which scenario each test covers and what still needs testing by hand.

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
- **It adds three tabs:** `RQ_Items` (item list, target levels, wishlist switches), `RQ_Settings` (expiring-soon days, priority threshold, lists) and `RQ_ColumnMap`.
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
- Items use category icons instead of product photos.
- Expired stock does not count as usable, so it raises the quantity needed on the wishlist.

## Decided at the site visit, not in code

- **Access option:** A, B or C. The code supports all three; [docs/SETUP.md](docs/SETUP.md) gives the settings for each.
- **KSK's real tab and header names:** these go into `RQ_ColumnMap` once Zi Ying has the sanitised sample.
- **Priority threshold:** High below 50% of the target. KSK can change it on the Settings screen.

## Not built (by plan priority)

- A daily email of expiring items (a "Could" feature).
- Product photos (a "Won't" feature).
- Camera scanning inside the app: the shelf QR opens with the phone's normal camera instead.
