/**
 * Serves the staff app. Which accounts can open it is decided by the
 * deployment settings (docs/SETUP.md, access options A, B or C).
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ResQStock')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Pastes another HTML file into the page: <?!= include('Styles'); ?>
 * Public on purpose (the pattern from Google's HtmlService guide). It only
 * returns page markup, never data.
 */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
