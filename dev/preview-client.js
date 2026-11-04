/*
 * DEVELOPMENT ONLY. Gives the preview page a google.script object like the
 * one Apps Script provides. Calls go to a hidden frame that runs the real
 * server files on fake spreadsheets (dev/gas-shim.js), with a little delay
 * so loading states show the way they do on a phone.
 *   Add ?reset=1 to the address to start again from fresh mock data.
 */
(function () {
  'use strict';

  var STORE_KEY = 'resqstock-preview-v1';
  var cfg = window.__RQ_PREVIEW__ || { app: 'staff' };
  var params = new URLSearchParams(location.search);
  if (params.has('reset')) {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage blocked */ }
    params.delete('reset');
    var qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  var frame = document.createElement('iframe');
  frame.src = '/dev/frame?app=' + encodeURIComponent(cfg.app);
  frame.title = 'Preview server';
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  var ready = new Promise(function (resolve) { frame.addEventListener('load', function () { resolve(); }); });
  function attach() { document.body.appendChild(frame); }
  if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);

  function fail(handlers, e) {
    var err = new Error(e && e.message ? e.message : String(e));
    if (handlers.fail) handlers.fail(err, handlers.user); else console.error(err);
  }

  function invoke(name, args, handlers) {
    var json;
    try { json = JSON.stringify(args); } catch (e) { fail(handlers, e); return; }
    setTimeout(function () {
      ready.then(function () {
        var out;
        try {
          var server = frame.contentWindow;
          if (!server || !server.__rqInvoke) throw new Error('The preview server frame did not start. Check the console.');
          out = server.__rqInvoke(name, json);
        } catch (e) {
          fail(handlers, e);
          return;
        }
        if (handlers.ok) handlers.ok(out === undefined ? undefined : JSON.parse(out), handlers.user);
      });
    }, 150 + Math.random() * 250);
  }

  function runner(handlers) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { return runner(Object.assign({}, handlers, { ok: fn })); };
        if (prop === 'withFailureHandler') return function (fn) { return runner(Object.assign({}, handlers, { fail: fn })); };
        if (prop === 'withUserObject') return function (obj) { return runner(Object.assign({}, handlers, { user: obj })); };
        return function () { invoke(String(prop), Array.prototype.slice.call(arguments), handlers); };
      }
    });
  }

  window.google = {
    script: {
      run: runner({}),
      url: {
        getLocation: function (callback) {
          var single = {}, multi = {};
          new URLSearchParams(location.search).forEach(function (v, k) {
            if (!(k in single)) single[k] = v;
            (multi[k] = multi[k] || []).push(v);
          });
          setTimeout(function () { callback({ hash: location.hash.replace(/^#/, ''), parameter: single, parameters: multi }); }, 0);
        }
      },
      history: { push: function () {}, replace: function () {}, setChangeHandler: function () {} },
      host: { close: function () {}, setHeight: function () {}, setWidth: function () {}, editor: { focus: function () {} } }
    }
  };
})();
