# Testing

`npm test` runs 26 automated tests in about a second: `test/logic.test.js` for the business rules, and `test/api.test.js` for the server code end to end on fake spreadsheets. The IDs match the Testing section of the system plan.

| ID | Scenario | How it is checked | Status |
| --- | --- | --- | --- |
| T1 | Scan a shelf QR and record 24 tins in | Automated (`T1`), and in the preview with `?item=BEANS-01` | Passing |
| T2 | Record 10 tins out; the earliest-expiring batch is suggested | Automated (`T2`) and in the preview | Passing |
| T3 | Record more out than the batch holds; saving is blocked | Automated (both files) and in the preview | Passing |
| T4 | Expiry boundaries: yesterday, today, 14 days, 15 days, blank | Automated (`T4`) | Passing |
| T5 | Expiring-soon window changed to 7 days | Automated (`T5`, saving settings) | Passing |
| T6 | Target 10 with stock 4, 7, 10 | Automated (`T6`) and in the preview | Passing |
| T7 | Public page shows only the four fields | Automated (`T6 and T7`) and in the preview | Passing |
| T8 | Account without access is refused | PIN (option C): automated. Google sign-in (options A and B): **test by hand** after deploying | Partly |
| T9 | Two phones save at the same moment | Every write runs inside `LockService`. **Test by hand** with two phones | Not run |
| T10 | Stock in on a phone over mobile data in under 1 minute | **Test by hand** at KSK | Not run |
| T11 | Header renamed, RQ_ColumnMap updated, app still works | Automated (`T11`), plus a one-tab log with a Type column | Passing |

## Screen sizes

The responsive layout uses these rules:

- **Below 1200px:** bottom tab bar, with horizontal icon-and-label tabs on tablets.
- **1200px and up:** sidebar and a wider content area.
- **Each page and card list** reflows based on its available width, including split-screen windows. Forms and widgets stay readable; pages scroll vertically.
- **Donor cards** choose their column count from the list width, including beside donation details.
- **Short windows:** sticky side panels return to normal page flow. Phone landscape also unsticks toolbars and form actions.
- **Notched screens:** content and fixed controls use safe-area padding; zoom remains enabled.

### Responsive change validation (9 November 2026)

Automated business tests: **26/26 passed**. Static demo and Apps Script bundle builds passed. The deployed responsive revision was checked in a Chromium browser on 9 November 2026. The overview, inventory, item details, stock-in/out forms, add-item form, wishlist manager, settings, QR labels, and public wishlist had no page-level horizontal overflow at all 10 viewport sizes below (100 page/viewport checks). Screenshots were also inspected for the desktop, iPad, phone, and short-landscape layouts. Inventory category chips intentionally scroll within their own row.

For future layout changes, repeat these checks with `npm run preview` or the deployed demo:

| Device/window | CSS viewport |
| --- | --- |
| Small phone | 320 × 640 |
| Phone | 390 × 844 |
| Phone landscape | 844 × 390 |
| iPad portrait | 768 × 1024 and 820 × 1180 |
| iPad landscape | 1024 × 768 and 1180 × 820 |
| Laptop | 1280 × 800 |
| Desktop | 1440 × 900 and 1920 × 1080 |

The checks above used the baseline sample data and browser viewport emulation. Physical iPad/iPhone Safari, Android Chrome, printed QR labels, long item names/units, empty results, and 200% zoom still need manual testing. Check that names and quantities remain readable, fields and buttons stay inside their cards, navigation and save controls remain reachable, and QR labels print in three columns.

## What the preview and the tests cannot prove

They run the real server code, but against stand-ins for Google's services (`dev/gas-shim.js`). Check these on a real deployment:

- Google sign-in, sharing and the "unverified app" consent screen.
- How Google Sheets converts typed values (dates, numbers, percentages) in KSK's real sheet.
- Speed and Apps Script quotas on KSK's full history.
- Scanning a printed QR label with a phone camera.
- Printing the QR labels from inside the Apps Script page. If the Print button does nothing, use the browser's own Print menu.
- Item photos with a real phone: "Take photo" opening the camera, pinch-to-zoom in the cropper, and iPhone photos. The preview tested the cropper with a mouse, the slider and generated images; the server tests cover saving, replacing, removing and rejecting non-image files.

## Bug log

Najwa keeps the shared bug log with these columns: ID, steps, expected result, actual result, owner, status. Retest every fix, and run `npm test` before each KSK review.
