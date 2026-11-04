'use strict';
/*
 * DEVELOPMENT ONLY. Builds the two kinds of page the preview needs, for both
 * the local preview server (dev/server.js) and the static demo build
 * (dev/build-demo.js):
 *   - the app page: Index.html with its includes pasted in, the way HtmlService
 *     does it, plus the preview client;
 *   - the hidden "server" frame that runs the real server files on fake sheets.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIRST = ['Config.js', 'Logic.js'];

/** Server files of one Apps Script project, Config and Logic first. */
function appFiles(app) {
  const all = fs.readdirSync(path.join(ROOT, app)).filter((f) => f.endsWith('.js'));
  return FIRST.filter((f) => all.includes(f)).concat(all.filter((f) => !FIRST.includes(f)).sort());
}

/**
 * cfg goes to window.__RQ_PREVIEW__: { app, frame?, demo? }.
 * head: extra markup for <head> (the demo adds noindex).
 */
function renderPage(app, cfg, head) {
  const dir = path.join(ROOT, app);
  let html = fs.readFileSync(path.join(dir, 'Index.html'), 'utf8');
  html = html.replace(/<\?!=\s*include\(\s*'([\w-]+)'\s*\);?\s*\?>/g, (m, name) => fs.readFileSync(path.join(dir, name + '.html'), 'utf8'));
  html = html.replace(/<\?[\s\S]*?\?>/g, '');
  const inject = (head || '') +
    '<script>window.__RQ_PREVIEW__ = ' + JSON.stringify(cfg) + ';</script><script src="/dev/preview-client.js"></script>';
  return html.replace(/<head>/i, '<head>' + inject);
}

/** globals: JavaScript source that defines __RQ_APP__, __RQ_USER__, __RQ_URL__ and __RQ_BASE__. */
function framePage(app, globals, head) {
  const scripts = ['/dev/gas-shim.js']
    .concat(appFiles(app).map((f) => '/src/' + app + '/' + f))
    .concat(app === 'staff' ? ['/dev/seed.js'] : [])
    .concat(['/dev/frame-boot.js'])
    .map((src) => '<script src="' + src + '"></script>')
    .join('\n');
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' + (head || '') + '<title>Preview server: ' + app + '</title></head>' +
    '<body><script>' + globals + '</script>\n' + scripts + '\n</body></html>';
}

module.exports = { ROOT, appFiles, renderPage, framePage };
