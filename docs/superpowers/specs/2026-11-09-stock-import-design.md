# Stock import

## Intent and agreed behavior

Staff can bring stock lists into ResQStock from Google Sheets, spreadsheet files, PDFs, and photos instead of retyping each stock-in entry. The user chose **add incoming stock**: import adds new batches and preserves existing stock and movement history. Keep the current responsive interface and both deployment modes. Publish the completed feature to GitHub and the existing Vercel URL, as already requested in this chat.

## Proposed approach

Use browser-side file reading and OCR, followed by editable review and server-side validation. This fits the existing vanilla JavaScript/Apps Script app and needs no paid AI account.

Alternatives considered: an AI document service can interpret more irregular receipts, but requires a paid service and uploads documents to it; spreadsheet-only importing is simpler but does not meet the PDF/photo request. The recommended browser approach supports clear printed lists and tables; it does not promise reliable handwriting or automatic interpretation of arbitrary receipts.

## Sources

- Upload CSV, TSV, XLSX/XLS, PDF, JPEG/JPG, PNG, or WebP. Offer a downloadable CSV template and a small sample import for trying the feature.
- Paste copied Google Sheets/Excel cells or delimited text.
- Paste a Google Sheets link and select its worksheet. In Apps Script, read sheets the executing Google account can access using the existing spreadsheet scope. In the Vercel demo, read publicly accessible Google Sheets through a restricted server endpoint; for a private sheet, explain that CSV/Excel upload or copying cells works without changing its sharing permissions. Do not imply that the demo has Google sign-in or silently publish a sheet.
- PDF text extraction uses PDF.js. Scanned PDFs and images use Tesseract.js OCR, loaded only when needed. Show progress, cancellation, and useful errors. Files are processed in the browser, not uploaded to an AI service. OCR may need corrections.
- Pin supported dependency versions. Reject unsupported files, files over 10 MB, PDFs over 10 pages, and import lists over 200 rows. Bound PDF/image rendering memory and spreadsheet row/column reads.

## User flow

Add **Import stock** beside inventory actions, to desktop navigation, and to the compact More screen. Source selection leads to a preview with source filename/worksheet, editable extracted text when relevant, and column mapping. Recognize common English/Malay header names; allow selecting a header row or treating the file as headerless.

Review rows before saving: include/exclude, item name or existing item match, quantity, unit, category, expiry date or explicit no-expiry choice, received date, and source. Existing items retain their canonical unit/category; mismatched units are flagged rather than converted. Unknown names are clearly shown as new items. Do not silently guess missing quantities, turn receipt prices into quantities, or silently interpret ambiguous dates. Let the user choose day-first/month-first dates and review the normalized result.

Show invalid rows with field errors and prevent committing until all included rows are valid. Warn about repeated rows and previously imported content. Review must include an explicit checkbox acknowledging extracted data was checked, and a final **Import N rows** action. On success show the saved count, new-item count, source, and a link back to inventory. Preserve the draft after a recoverable error. Changing source/mapping invalidates previous review confirmation. Do not retain uploaded file bytes after leaving the importer.

## Data integrity

Apply the existing access check, stock-in validation, script lock, column mapping, timezone, and wishlist refresh. Validate every row before stock writes. New items are off the public wishlist unless separately configured. Imported text must not become spreadsheet formulas or HTML.

Use an import ID and durable import journal to prevent duplicate stock on double clicks, retries, or a lost success response. Reject reuse of an ID with different data. Detect repeated content even with a new ID and require an explicit duplicate override. Record enough information to recover a completed stock write after a journal-finalization error; ambiguous partial state must fail closed rather than append again. Do not claim cross-sheet atomic transactions: metadata rows may have been created before a later write failure, but retries must reuse them and never duplicate the stock batch.

The Google Sheets endpoint accepts validated Google spreadsheet IDs/worksheet IDs only, follows only approved Google export hosts, bounds response size/time, and returns an access error for private sheets. It never accepts arbitrary fetch destinations or exposes credentials.

## UI and delivery

Match ResQStock's green palette and existing form controls. Mapping and row editing stack on phones, use available tablet space, and become a compact review table on desktop. Provide keyboard labels, focus handling, loading/error/empty/success states, and visible cancellation.

Vercel remains a sample-data demo: successful imports change that browser's sample stock. Actual shared Google Sheet writes occur in the Apps Script deployment. Keep that distinction visible.

## Acceptance checks

Test quoted CSV/newlines/BOM, pasted tabs, spreadsheet date values, ambiguous/invalid dates, malformed and oversize data, formula-like text, matched/new items, unit mismatch, duplicate rows/imports, auth, failed validation with no stock write, lost-response retries, journal recovery, and custom column maps. Verify public-sheet fetch restrictions and private-sheet errors. Browser-check a real CSV, XLSX, text PDF, scanned PDF, and JPEG fixture through review and stock increase. Check importer layout at 390, 820, and 1440 pixels. Run the full test suite and both builds, review the completed change, merge on GitHub, and confirm Vercel production serves it.

## Builder decisions

Exact parsing heuristics, file organization, library versions, journal columns, and small UI details are implementation decisions. Preserve the behavior and limits above; document meaningful deviations and verification limits.
