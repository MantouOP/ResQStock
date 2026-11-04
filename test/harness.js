'use strict';
/*
 * Loads an Apps Script project (staff/ or wishlist/) into its own Node vm
 * context, with the fake services from dev/gas-shim.js. Files share one
 * global scope, the way Apps Script runs them.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIRST = ['Config.js', 'Logic.js'];

function appFiles(app) {
  const all = fs.readdirSync(path.join(ROOT, app)).filter((f) => f.endsWith('.js'));
  return FIRST.filter((f) => all.includes(f)).concat(all.filter((f) => !FIRST.includes(f)).sort());
}

function run(ctx, rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
}

function newDrive() {
  return { files: {}, active: {}, props: {}, denied: {}, seq: 1 };
}

/** opts.seed: also load dev/seed.js (staff only). */
function loadApp(app, drive, opts = {}) {
  const ctx = vm.createContext({
    console,
    __RQ_APP__: app,
    __RQ_DRIVE__: drive,
    __RQ_USER__: opts.user === undefined ? 'tester@example.org' : opts.user,
    __RQ_URL__: 'https://script.google.com/macros/s/TEST/exec'
  });
  run(ctx, 'dev/gas-shim.js');
  appFiles(app).forEach((f) => run(ctx, app + '/' + f));
  if (opts.seed) run(ctx, 'dev/seed.js');
  return ctx;
}

/** What the browser would receive: plain JSON. */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function api(ctx, action, payload, pin) {
  return plain(ctx.api(action, payload || {}, pin || ''));
}

module.exports = { ROOT, appFiles, newDrive, loadApp, plain, api };
