/*
 * DEVELOPMENT ONLY. Runs inside the hidden "server" frame of the preview.
 * The page talks to it through __rqInvoke, the way google.script.run talks
 * to Apps Script: JSON in, JSON out, private (name_) functions refused.
 */
(function (g) {
  'use strict';

  function check(value, path) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      throw new Error('Apps Script cannot send a Date to the browser (' + path + '). Send an ISO string instead.');
    }
    if (typeof value === 'function') throw new Error('Cannot send a function to the browser (' + path + ').');
    if (typeof value === 'number' && !isFinite(value)) console.warn('Preview: ' + path + ' is ' + value + '; Apps Script would send null.');
    if (value && typeof value === 'object') Object.keys(value).forEach(function (k) { check(value[k], path + '.' + k); });
  }

  g.__rqInvoke = function (name, argsJson) {
    var fn = g[name];
    if (typeof fn !== 'function' || /_$/.test(name) || name.indexOf('__') === 0) {
      throw new Error('Script function not found: ' + name);
    }
    var result = fn.apply(null, JSON.parse(argsJson || '[]'));
    if (result === undefined) return undefined;
    check(result, name + '()');
    return JSON.stringify(result);
  };

  if (g.__RQ_APP__ === 'staff' && typeof g.__rqSeedPreview === 'function') {
    try {
      g.__rqSeedPreview({ baseUrl: g.__RQ_BASE__ });
    } catch (e) {
      console.error('Preview: could not create the mock data.', e);
    }
  }
})(globalThis);
