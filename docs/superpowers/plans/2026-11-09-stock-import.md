# Stock import implementation plan

> For agentic workers: execute with the executing-plans skill, task by task, with a fresh whole-change review at the end.

**Goal:** Import incoming stock from spreadsheets, Google Sheets, PDFs, and photos through editable review and retry-safe saving.
**Architecture:** Browser modules extract and map source data. Authenticated Apps Script handlers validate and commit batches using an import journal. The static demo runs those same handlers against its existing mock sheets; a restricted Vercel function reads public Google Sheets.
**Tech stack:** Vanilla JS/HTML/CSS, Apps Script, Node tests, pinned SheetJS 0.20.3, Tesseract.js 7.0.0, PDF.js 6.5.438 (legacy browser build).
**Spec:** `docs/superpowers/specs/2026-11-09-stock-import-design.md` (approved in chat).

## Global constraints

- Add incoming stock; preserve existing records. No AI service or credentials required.
- Maximum 10 MB/file, 10 PDF pages, 200 included stock rows, bounded image/PDF rendering and spreadsheet reads.
- Review and explicit acknowledgement precede writes. Never infer quantity from a price or silently pick an ambiguous date convention.
- Existing access checks, lock, column map, date rules, and wishlist refresh apply. New items are initially hidden from donors.
- Demo data stays in the user's browser; real shared writes require Apps Script. Private Sheets use existing Apps Script access or export/paste fallback.
- Preserve responsive layout at 390, 820, and 1440 pixels and lazy-load the large extraction libraries.

## Review focus

1. Lost success responses and journal-finalization failures must not duplicate stock (Task 2).
2. Same item name with incompatible units must block; changing review data resets acknowledgement (Tasks 2 and 3).
3. Formula-like names and document strings must remain inert in Sheets and HTML (Tasks 1–3).
4. A private-sheet redirect or malicious export URL must not become an open proxy (Task 2).
5. Cancellation or navigation while OCR runs must release workers and never apply a stale extraction to a new draft (Task 3).

## Task 1: Parse and normalize source data

Files: create `staff/ImportCore.html`, `test/import-core.test.js`; integrate its include in `staff/Index.html` in Task 3.
Interface: global `ImportCore` exposes delimited-text parsing, header detection/mapping, source-row normalization, strict quantity/date conversion, document-line conversion, and Google Sheets URL parsing. Return editable rows plus errors/warnings, never stock writes.

- [ ] Write failing tests for quoted CSV/newlines/BOM, pasted TSV, English/Malay aliases, headerless files, non-finite/negative/price quantities, day/month dates, Excel serial dates, repeated header lines, document rows, and limits.
- [ ] Run `node --test test/import-core.test.js`; verify failures precede implementation.
- [ ] Implement pure parsing/mapping with source-row numbers and explicit errors. Keep formulas and HTML as strings; never evaluate them.
- [ ] Run the tests and full `npm test`; commit the passing parser.

## Task 2: Safe bulk stock-in and Sheets reading

Files: create `staff/Imports.js`, `api/sheets.js`, `test/import-api.test.js`, `test/sheets-source.test.js`; modify `staff/Api.js` and `dev/server.js`. Extend mock services only for real Apps Script APIs the implementation uses.
Interfaces: `previewImport({rows,source})` returns normalized rows, field errors, existing/new item matches, and duplicate warnings. `commitImport({id,rows,source,allowDuplicate,reviewed})` revalidates under the lock, returns a stable result on retries, and refreshes the wishlist once. `readImportSheet({url,sheetId})` reads an accessible external sheet in Apps Script. `GET /api/sheets?id=...&gid=...` returns bounded public CSV for the demo.

- [ ] Write failing API tests for valid mixed existing/new rows, all-row validation before writes, access, units, duplicates, changed-token payload, failed/lost-response retries, journal recovery, and custom/shared stock logs.
- [ ] Write failing endpoint tests for invalid IDs, private/login responses, redirect hosts, size/time bounds, and successful CSV.
- [ ] Implement a durable import journal and a contiguous stock-in write; never append again after ambiguous completion. Store enough normalized rows/references for recovery, with bounded journal cells. Reject formula-leading imported metadata before writes.
- [ ] Add Sheets reading through existing Apps Script access. The demo accepts the selected worksheet's link/GID; inaccessible private sources return export/paste guidance without changing sharing.
- [ ] Run targeted and full tests; commit the passing server functionality.

## Task 3: Import workflow and document extraction

Files: create `staff/ImportFiles.html`, `staff/ImportView.html`; modify `staff/App.html`, `staff/Index.html`, and `staff/Styles.html`; add fixture files/tests as needed.
Interfaces: `ImportFiles.read(file,options)` yields worksheets/matrix or editable document text, supports progress/cancellation, and owns temporary resources. `StockImportView.mount(context)` receives existing shell/API/escaping/navigation helpers and returns cleanup. The route disposes cleanup on exit.

- [ ] Implement source tabs for file, Google Sheets, and paste; template/sample actions; extraction progress and errors.
- [ ] Read XLS/XLSX through SheetJS, text PDFs through PDF.js, scanned PDF pages/images through Tesseract with bounded canvas sizes. Release workers/PDFs and ignore canceled results.
- [ ] Add header/column mapping, explicit date convention, defaults for received date/source, editable include rows, item matching, explicit no-expiry, field errors, duplicate warnings, review acknowledgement, commit/retry state, and success summary.
- [ ] Add import navigation/actions and responsive styles matching the app.
- [ ] Verify CSV, XLSX, PDF text, scanned PDF, JPEG, and pasted cells using synthetic stock fixtures. Check actual stock changes and retry behavior, plus responsive screenshots and browser errors.
- [ ] Run full tests, demo build, Apps Script bundle, and whitespace checks; commit.

## Task 4: Review and publish

- [ ] Record actual supported formats, limits, Sheets access, OCR limitations, and test evidence in README/testing docs.
- [ ] Obtain a fresh code review focused on data integrity and the five review risks above; fix material findings and rerun affected checks.
- [ ] Publish through the signed-in GitHub browser session (user cannot enable the GitHub plugin); compare uploaded Git content to the tested local tree before merging.
- [ ] Merge to main under the user's existing release authorization, verify Vercel READY for the merged SHA, and confirm the public app exposes Import stock. Sync local main without losing the feature branch.
