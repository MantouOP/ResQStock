#!/usr/bin/env node
/*
 * Builds paste-ready files for the guided setup at KSK, so nobody has to
 * copy twelve files by hand:
 *   dist/staff/     Code.gs + Index.html + Styles.html + App.html + appsscript.json
 *   dist/wishlist/  Code.gs + Index.html + appsscript.json
 * Usage: npm run bundle
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIRST = ['Config.js', 'Logic.js'];
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

function bundle(app) {
  const src = path.join(ROOT, app);
  const out = path.join(ROOT, 'dist', app);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const js = fs.readdirSync(src).filter((f) => f.endsWith('.js'));
  const order = FIRST.filter((f) => js.includes(f)).concat(js.filter((f) => !FIRST.includes(f)).sort());
  const header = '/**\n * ResQStock ' + app + ' app, version ' + VERSION + '.\n' +
    ' * Built from the ' + app + '/ folder with `npm run bundle`. Paste this whole file into Code.gs.\n' +
    ' * Do not edit it here: change the source files and bundle again.\n */\n';
  const body = order.map((f) => '\n/* ===== ' + f + ' ===== */\n\n' + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
  fs.writeFileSync(path.join(out, 'Code.gs'), header + body);

  const copied = fs.readdirSync(src).filter((f) => f.endsWith('.html') || f === 'appsscript.json');
  copied.forEach((f) => fs.copyFileSync(path.join(src, f), path.join(out, f)));
  console.log('dist/' + app + ': Code.gs (' + order.join(', ') + ') + ' + copied.join(', '));
}

bundle('staff');
bundle('wishlist');
