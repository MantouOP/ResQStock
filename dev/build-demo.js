#!/usr/bin/env node
/*
 * Builds the public demo into demo-dist/: the preview (the real app code
 * running on fake spreadsheets in the browser) as plain static files, for
 * Vercel or any static host. Each visitor gets their own sample data, kept in
 * their own browser. Nothing is sent to Google, and every page says it is a demo.
 *   node dev/build-demo.js        (Vercel runs this on every push to main)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, appFiles, renderPage, framePage } = require('./pages');

const OUT = path.join(ROOT, 'demo-dist');
const NOINDEX = '<meta name="robots" content="noindex, nofollow">';

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copy(fromRel, toRel) {
  write(toRel, fs.readFileSync(path.join(ROOT, fromRel)));
}

/** The demo works on any domain, so the frame works out its own address. */
function frameGlobals(app) {
  return 'var __RQ_APP__ = ' + JSON.stringify(app) + ';' +
    ' var __RQ_USER__ = ' + JSON.stringify(app === 'staff' ? 'demo.volunteer@example.org' : '') + ';' +
    ' var __RQ_BASE__ = location.origin + "/";' +
    ' var __RQ_URL__ = __RQ_BASE__' + (app === 'staff' ? '' : ' + "wishlist"') + ';';
}

fs.rmSync(OUT, { recursive: true, force: true });

write('index.html', renderPage('staff', { app: 'staff', demo: true, frame: '/dev/frame-staff.html' }, NOINDEX));
write('wishlist/index.html', renderPage('wishlist', { app: 'wishlist', demo: true, frame: '/dev/frame-wishlist.html' }, NOINDEX));
write('dev/frame-staff.html', framePage('staff', frameGlobals('staff'), NOINDEX));
write('dev/frame-wishlist.html', framePage('wishlist', frameGlobals('wishlist'), NOINDEX));
['gas-shim.js', 'preview-client.js', 'frame-boot.js', 'seed.js'].forEach((f) => copy('dev/' + f, 'dev/' + f));
['staff', 'wishlist'].forEach((app) => appFiles(app).forEach((f) => copy(app + '/' + f, 'src/' + app + '/' + f)));
write('robots.txt', 'User-agent: *\nDisallow: /\n');

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log('Demo built: demo-dist/ (' + count(OUT) + ' files). Staff app at /, donor page at /wishlist');
