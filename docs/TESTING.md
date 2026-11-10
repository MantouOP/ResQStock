# Testing

`npm test` runs 25 automated tests in about a second: `test/logic.test.js` for the business rules, and `test/api.test.js` for the server code end to end on fake spreadsheets. The IDs match the Testing section of the system plan.

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

The preview has been checked in Chromium at 320 × 640 (small phone), 375 × 812 (phone), 812 × 375 (phone held sideways), 768 × 1024 (tablet), 1280 × 800 (laptop) and 1680 × 900 (wide monitor), with no sideways scrolling at any of them. The layout rules:

- **Below 960px:** bottom tab bar.
- **960px and up:** sidebar.
- **Each page** reflows based on its own width, so a resized window behaves like a tablet.

Still check this on a real iPhone (Safari) and an Android phone.

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
