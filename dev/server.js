#!/usr/bin/env node
/*
 * DEVELOPMENT ONLY. Local preview of ResQStock with fake data, no Google
 * account needed. Serves the real staff and wishlist pages and runs the real
 * server code in a hidden frame against fake spreadsheets.
 *
 *   node dev/server.js [port]      (default port 5180)
 *   http://localhost:5180/          staff app
 *   http://localhost:5180/wishlist  public donor wishlist
 *   add ?reset=1 to start again from fresh mock data
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { ROOT, renderPage, framePage } = require('./pages');

const PORT = Number(process.argv[2] || process.env.PORT || 5180);
const BASE = 'http://localhost:' + PORT + '/';
const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function frameGlobals(app) {
  const globals = {
    __RQ_APP__: app,
    __RQ_USER__: app === 'staff' ? 'volunteer@example.org' : '',
    __RQ_URL__: app === 'staff' ? BASE : BASE + 'wishlist',
    __RQ_BASE__: BASE
  };
  return Object.keys(globals).map((k) => 'var ' + k + ' = ' + JSON.stringify(globals[k]) + ';').join(' ');
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, BASE);
  const send = (code, type, body) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const sendFile = (file) => {
    if (!fs.existsSync(file)) return send(404, 'text/plain; charset=utf-8', 'Not found');
    return send(200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
  };
  try {
    if (url.pathname === '/api/sheets') return require('../api/sheets')(req, res);
    if (url.pathname === '/' || url.pathname === '/index.html') return send(200, TYPES['.html'], renderPage('staff', { app: 'staff' }));
    if (url.pathname === '/wishlist') return send(200, TYPES['.html'], renderPage('wishlist', { app: 'wishlist' }));
    if (url.pathname === '/dev/frame') {
      const app = url.searchParams.get('app') === 'wishlist' ? 'wishlist' : 'staff';
      return send(200, TYPES['.html'], framePage(app, frameGlobals(app)));
    }
    let m = /^\/dev\/([\w-]+\.js)$/.exec(url.pathname);
    if (m) return sendFile(path.join(ROOT, 'dev', m[1]));
    m = /^\/src\/(staff|wishlist)\/([\w-]+\.js)$/.exec(url.pathname);
    if (m) return sendFile(path.join(ROOT, m[1], m[2]));
    return send(404, 'text/plain; charset=utf-8', 'Not found');
  } catch (e) {
    return send(500, 'text/plain; charset=utf-8', String((e && e.stack) || e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('ResQStock preview (fake data):');
  console.log('  staff app      ' + BASE);
  console.log('  donor wishlist ' + BASE + 'wishlist');
  console.log('  fresh data     ' + BASE + '?reset=1');
});
