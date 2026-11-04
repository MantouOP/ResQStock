# Guided setup at KSK

Go-live is one session of about 90 minutes. A KSK representative (Rose or Khairul) does every step under **KSK's own Google account**, and the team only guides. The team never needs access to the live sheet.

## Before the session (team)

- [ ] Run `npm test` and confirm all tests pass on the release you will install.
- [ ] Run `npm run bundle`. This creates `dist/staff/` (5 files) and `dist/wishlist/` (3 files), ready to paste.
- [ ] Agree on the access option with KSK (table below).
- [ ] Bring the user guide, and blank label paper for the QR labels.

## Access options

| Option | Use when | Deploy settings for the staff app |
| --- | --- | --- |
| **A (recommended)** | Staff have Google accounts | Execute as: **User accessing the web app**. Who has access: **Anyone with Google account**. Then share the sheet (Editor) with each staff account. |
| B | KSK uses Google Workspace on its own domain | Execute as: **User accessing the web app**. Who has access: **Anyone within KSK's domain**. |
| C (fallback) | Volunteers have no Google account | Execute as: **Me**. Who has access: **Anyone**. Then ResQStock > Set or clear the staff PIN. Change the PIN every month. |

Under A and B, only people the sheet is shared with can open the staff app, and removing someone means unsharing the sheet. Under C, anyone with the link and the PIN can get in.

## Steps (KSK at the keyboard)

1. **Back up.** Open KSK's stock sheet and choose File > Make a copy.
2. **Check the time zone.** In File > Settings, the time zone should be (GMT+08:00) Kuala Lumpur.
3. **Add the staff code.** Open Extensions > Apps Script.
   - In Project Settings, tick "Show appsscript.json manifest file in editor".
   - Replace `Code.gs` with `dist/staff/Code.gs`.
   - Add HTML files named `Index`, `Styles` and `App` with the contents of the files of the same name.
   - Replace `appsscript.json` with `dist/staff/appsscript.json`.
   - Save.
4. **Run setup.** Reload the sheet. A **ResQStock** menu appears. Choose **Set up or check**.
   - Google asks for permission. It may show "Google hasn't verified this app". That is expected for a private script: choose Advanced, then Go to ResQStock.
   - If setup offers to add *Expiry date* and *Batch ID* columns, add them only if KSK agrees. Existing columns are not moved.
   - If setup says a tab or column is missing, fix the names in **RQ_ColumnMap**, then run setup again until it passes.
5. **Set target levels.** Fill in the *Target level* column in **RQ_Items**, or later on the Donor wishlist screen of the app. *Show on wishlist* decides what donors see.
6. **Deploy the staff app.** Choose Deploy > New deployment > Web app, with the settings for the chosen access option. Copy the `/exec` link into **RQ_Settings > staff_app_url**.
7. **Create the public copy.** Choose **ResQStock > Create the public wishlist spreadsheet** and copy the ID it shows. In its **Info** tab, fill in the address, opening hours and contact. Leave anything that should not be public blank.
8. **Deploy the donor page.** Still signed in as KSK, go to script.google.com and choose New project.
   - Paste in `dist/wishlist/Code.gs`, `Index.html` and `appsscript.json`.
   - In Project Settings > Script Properties, add `WISHLIST_SHEET_ID` with the ID from step 7.
   - Choose Deploy > New deployment > Web app. Execute as: **Me**. Who has access: **Anyone**.
   - Copy the link into **RQ_Settings > wishlist_page_url** and into the **Page link** row of the Info tab.
9. **Turn on the hourly sync.** Choose **ResQStock > Turn on hourly wishlist sync**. This runs as KSK's account, so the donor page stays current even when a staff account cannot edit the public copy.
10. **Print the QR labels.** In the staff app, open More > QR labels and choose Print. Stick one label per shelf or item, and put the donor QR on posters.
11. **Smoke test on live data,** then delete the test rows:
    - **T1:** record a stock in, and check that a new row appears in the stock-in tab.
    - **T7:** open the donor page, and check that only name, quantity needed, priority and date appear.
    - **T8:** open the staff link with an account the sheet is not shared with (A or B), or with a wrong PIN (C). It must be refused.

## After go-live

- **Add a staff member:** share the sheet with their Google account (A or B), or give them the PIN in person (C). For instant donor-page updates, also share the public wishlist spreadsheet with them (Editor). Otherwise the hourly sync covers it.
- **Remove a staff member:** unshare the sheet (A or B), or change the PIN (C).
- **Update the code:** paste the new bundle, then choose Deploy > Manage deployments > Edit > Version: New version. The links and QR codes stay the same.
- **The sheet structure changes:** update RQ_ColumnMap, then run **Set up or check**.
