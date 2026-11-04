/*
 * DEVELOPMENT ONLY. Small stand-ins for the Apps Script services ResQStock
 * uses (SpreadsheetApp, PropertiesService, Utilities...), so the real server
 * code in staff/ and wishlist/ runs unchanged in the browser preview and in
 * the Node tests. This folder is never pushed to Apps Script.
 *
 * Globals read: __RQ_APP__ ('staff' | 'wishlist'), __RQ_DRIVE__ (a shared
 * in-memory store, tests only), __RQ_USER__ (signed-in email), __RQ_URL__
 * (what ScriptApp.getService().getUrl() returns).
 */
(function (g) {
  'use strict';

  var APP = g.__RQ_APP__ || 'staff';
  var STORE_KEY = 'resqstock-preview-v1';
  var DEFAULT_TZ = 'Asia/Kuala_Lumpur';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
  function isBlank(v) { return v === '' || v === null || v === undefined; }
  function cloneCell(v) { return isDate(v) ? new Date(v.getTime()) : v; }

  /* ------------------------------------------------------------------ */
  /* The fake Drive: spreadsheets and script properties                  */
  /* ------------------------------------------------------------------ */

  function load() {
    try {
      var raw = g.localStorage && g.localStorage.getItem(STORE_KEY);
      if (raw) {
        return JSON.parse(raw, function (k, v) {
          return v && typeof v === 'object' && Object.keys(v).length === 1 && typeof v.$d === 'number' ? new Date(v.$d) : v;
        });
      }
    } catch (e) { /* storage blocked: start empty */ }
    return {};
  }

  var drive = g.__RQ_DRIVE__ || load();
  ['files', 'active', 'props', 'denied'].forEach(function (k) { if (!drive[k]) drive[k] = {}; });
  if (!drive.seq) drive.seq = 1;

  function save() {
    if (g.__RQ_DRIVE__) return; // tests keep everything in memory
    try {
      g.localStorage && g.localStorage.setItem(STORE_KEY, JSON.stringify(drive, function (k, v) {
        var original = this[k];
        return isDate(original) ? { $d: original.getTime() } : v;
      }));
    } catch (e) { /* storage full or blocked */ }
  }

  /** Sheets turns typed numbers and percentages into numbers. */
  function toCell(v) {
    if (v === undefined || v === null) return '';
    if (isDate(v)) return new Date(v.getTime());
    if (typeof v === 'string') {
      var s = v.trim();
      if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
      if (/^-?\d+(\.\d+)?%$/.test(s)) return Number(s.slice(0, -1)) / 100;
    }
    return v;
  }

  /* ------------------------------------------------------------------ */
  /* Range, Sheet, Spreadsheet                                           */
  /* ------------------------------------------------------------------ */

  function Range(sheet, row, col, numRows, numCols) {
    this._s = sheet; this._r = row; this._c = col; this._nr = numRows; this._nc = numCols;
  }
  Range.prototype.getValues = function () {
    var data = this._s._d.data, out = [];
    for (var i = 0; i < this._nr; i++) {
      var src = data[this._r - 1 + i] || [];
      var row = [];
      for (var j = 0; j < this._nc; j++) {
        var v = src[this._c - 1 + j];
        row.push(isBlank(v) ? '' : cloneCell(v));
      }
      out.push(row);
    }
    return out;
  };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.getDisplayValues = function () {
    return this.getValues().map(function (r) { return r.map(function (v) { return isDate(v) ? v.toISOString() : String(v); }); });
  };
  Range.prototype.setValues = function (values) {
    if (!Array.isArray(values) || values.length !== this._nr) {
      throw new Error('The number of rows in the data does not match the number of rows in the range. The data has ' + (values && values.length) + ' but the range has ' + this._nr + '.');
    }
    var data = this._s._d.data;
    for (var i = 0; i < this._nr; i++) {
      if (!Array.isArray(values[i]) || values[i].length !== this._nc) {
        throw new Error('The number of columns in the data does not match the number of columns in the range. The data has ' + (values[i] && values[i].length) + ' but the range has ' + this._nc + '.');
      }
      var r = this._r - 1 + i;
      while (data.length <= r) data.push([]);
      for (var j = 0; j < this._nc; j++) {
        var c = this._c - 1 + j;
        while (data[r].length <= c) data[r].push('');
        data[r][c] = toCell(values[i][j]);
      }
    }
    save();
    return this;
  };
  Range.prototype.setValue = function (v) {
    var rows = [];
    for (var i = 0; i < this._nr; i++) {
      var row = [];
      for (var j = 0; j < this._nc; j++) row.push(v);
      rows.push(row);
    }
    return this.setValues(rows);
  };
  Range.prototype.clearContent = function () { return this.setValue(''); };
  Range.prototype.getRow = function () { return this._r; };
  Range.prototype.getColumn = function () { return this._c; };
  Range.prototype.getNumRows = function () { return this._nr; };
  Range.prototype.getNumColumns = function () { return this._nc; };
  Range.prototype.getLastRow = function () { return this._r + this._nr - 1; };
  Range.prototype.getLastColumn = function () { return this._c + this._nc - 1; };
  ['setFontWeight', 'setBackground', 'setFontColor', 'setFontSize', 'setNumberFormat', 'setHorizontalAlignment',
    'setWrap', 'setNote', 'setDataValidation', 'setBorder'].forEach(function (m) {
    Range.prototype[m] = function () { return this; };
  });

  function Sheet(spreadsheet, d) { this._ss = spreadsheet; this._d = d; }
  Sheet.prototype.getName = function () { return this._d.name; };
  Sheet.prototype.setName = function (name) { this._d.name = name; save(); return this; };
  Sheet.prototype.getSheetId = function () { return this._d.sid; };
  Sheet.prototype.getParent = function () { return this._ss; };
  Sheet.prototype.getLastRow = function () {
    var data = this._d.data;
    for (var r = data.length - 1; r >= 0; r--) {
      if ((data[r] || []).some(function (v) { return !isBlank(v); })) return r + 1;
    }
    return 0;
  };
  Sheet.prototype.getLastColumn = function () {
    var max = 0;
    this._d.data.forEach(function (row) {
      for (var c = (row || []).length - 1; c >= 0; c--) {
        if (!isBlank(row[c])) { if (c + 1 > max) max = c + 1; break; }
      }
    });
    return max;
  };
  Sheet.prototype.getMaxRows = function () { return Math.max(1000, this._d.data.length); };
  Sheet.prototype.getMaxColumns = function () { return Math.max(26, this.getLastColumn()); };
  Sheet.prototype.getRange = function (a, b, c, d) {
    if (typeof a === 'string') return a1Range(this, a);
    var nr = c === undefined ? 1 : c;
    var nc = d === undefined ? 1 : d;
    if (!(a >= 1 && b >= 1 && nr >= 1 && nc >= 1)) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    return new Range(this, a, b, nr, nc);
  };
  Sheet.prototype.getDataRange = function () {
    return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  };
  Sheet.prototype.appendRow = function (values) {
    if (!values.length) throw new Error('appendRow needs at least one value.');
    new Range(this, this.getLastRow() + 1, 1, 1, values.length).setValues([values.slice()]);
    return this;
  };
  Sheet.prototype.clearContents = function () { this._d.data = []; save(); return this; };
  Sheet.prototype.clear = Sheet.prototype.clearContents;
  Sheet.prototype.deleteRow = function (r) { this._d.data.splice(r - 1, 1); save(); return this; };
  ['setFrozenRows', 'setFrozenColumns', 'autoResizeColumn', 'autoResizeColumns', 'setColumnWidth', 'setColumnWidths',
    'hideSheet', 'showSheet', 'activate', 'setTabColor', 'insertColumnsAfter', 'insertColumnAfter'].forEach(function (m) {
    Sheet.prototype[m] = function () { return this; };
  });

  function a1Range(sheet, a1) {
    var m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(a1.trim());
    if (!m) throw new Error('Range not found: ' + a1);
    var col = function (s) { return s.toUpperCase().split('').reduce(function (n, ch) { return n * 26 + ch.charCodeAt(0) - 64; }, 0); };
    var r1 = +m[2], c1 = col(m[1]);
    var r2 = m[4] ? +m[4] : r1, c2 = m[3] ? col(m[3]) : c1;
    return new Range(sheet, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
  }

  function Spreadsheet(id) { this._id = id; }
  Spreadsheet.prototype._file = function () {
    var f = drive.files[this._id];
    if (!f) throw new Error('This spreadsheet was deleted.');
    return f;
  };
  Spreadsheet.prototype.getId = function () { return this._id; };
  Spreadsheet.prototype.getName = function () { return this._file().name; };
  Spreadsheet.prototype.getUrl = function () { return 'https://docs.google.com/spreadsheets/d/' + this._id + '/edit'; };
  Spreadsheet.prototype.getSpreadsheetTimeZone = function () { return this._file().tz || DEFAULT_TZ; };
  Spreadsheet.prototype.setSpreadsheetTimeZone = function (tz) { this._file().tz = tz; save(); return this; };
  Spreadsheet.prototype.getSheets = function () {
    var self = this;
    return this._file().sheets.map(function (d) { return new Sheet(self, d); });
  };
  Spreadsheet.prototype.getSheetByName = function (name) {
    var hit = null, self = this;
    this._file().sheets.forEach(function (d) { if (!hit && d.name === name) hit = new Sheet(self, d); });
    return hit;
  };
  Spreadsheet.prototype.getActiveSheet = function () { return this.getSheets()[0] || null; };
  Spreadsheet.prototype.insertSheet = function (name) {
    var f = this._file();
    name = name || 'Sheet' + (f.sheets.length + 1);
    if (f.sheets.some(function (d) { return d.name === name; })) {
      throw new Error('A sheet with the name "' + name + '" already exists. Please enter another name.');
    }
    var d = { name: name, data: [], sid: drive.seq++ };
    f.sheets.push(d);
    save();
    return new Sheet(this, d);
  };
  Spreadsheet.prototype.deleteSheet = function (sheet) {
    var f = this._file();
    f.sheets = f.sheets.filter(function (d) { return d !== sheet._d; });
    save();
  };
  Spreadsheet.prototype.toast = function () {};

  function createSpreadsheet(name) {
    var id = 'mock-' + (drive.seq++) + '-' + Math.random().toString(36).slice(2, 8);
    drive.files[id] = { id: id, name: name || 'Untitled spreadsheet', tz: DEFAULT_TZ, sheets: [{ name: 'Sheet1', data: [], sid: 0 }] };
    save();
    return new Spreadsheet(id);
  }

  g.SpreadsheetApp = {
    getActiveSpreadsheet: function () {
      var id = drive.active[APP];
      return id && drive.files[id] ? new Spreadsheet(id) : null;
    },
    getActive: function () { return g.SpreadsheetApp.getActiveSpreadsheet(); },
    openById: function (id) {
      if (!drive.files[id]) throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp.');
      if (drive.denied[APP + ':' + id]) throw new Error('You do not have permission to access the requested document.');
      return new Spreadsheet(id);
    },
    create: createSpreadsheet,
    flush: function () {},
    getUi: function () { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
    /* Development helpers, not part of Apps Script. */
    __setActive: function (id) { drive.active[APP] = id; save(); },
    __deny: function (app, id) { drive.denied[app + ':' + id] = true; save(); }
  };

  /* ------------------------------------------------------------------ */
  /* Properties, cache, lock, session                                    */
  /* ------------------------------------------------------------------ */

  function Props(scope) { this._scope = scope; }
  Props.prototype._map = function () { return drive.props[this._scope] || (drive.props[this._scope] = {}); };
  Props.prototype.getProperty = function (k) { var m = this._map(); return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; };
  Props.prototype.setProperty = function (k, v) { this._map()[k] = String(v); save(); return this; };
  Props.prototype.deleteProperty = function (k) { delete this._map()[k]; save(); return this; };
  Props.prototype.getProperties = function () { var m = this._map(), out = {}; Object.keys(m).forEach(function (k) { out[k] = m[k]; }); return out; };
  Props.prototype.setProperties = function (obj) { var m = this._map(); Object.keys(obj).forEach(function (k) { m[k] = String(obj[k]); }); save(); return this; };
  Props.prototype.deleteAllProperties = function () { drive.props[this._scope] = {}; save(); return this; };

  g.PropertiesService = {
    getScriptProperties: function () { return new Props(APP); },
    getUserProperties: function () { return new Props(APP + ':user'); },
    getDocumentProperties: function () { return new Props(APP + ':doc'); },
    __forApp: function (app) { return new Props(app); }
  };

  var cacheStore = {};
  var cache = {
    get: function (k) { var e = cacheStore[k]; if (!e) return null; if (Date.now() > e.until) { delete cacheStore[k]; return null; } return e.v; },
    put: function (k, v, seconds) { cacheStore[k] = { v: String(v), until: Date.now() + 1000 * (seconds || 600) }; },
    remove: function (k) { delete cacheStore[k]; },
    __clear: function () { cacheStore = {}; }
  };
  g.CacheService = { getScriptCache: function () { return cache; }, getUserCache: function () { return cache; }, getDocumentCache: function () { return cache; } };

  var lock = { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {}, hasLock: function () { return true; } };
  g.LockService = { getScriptLock: function () { return lock; }, getUserLock: function () { return lock; }, getDocumentLock: function () { return lock; } };

  var user = { getEmail: function () { return g.__RQ_USER__ || ''; } };
  g.Session = {
    getActiveUser: function () { return user; },
    getEffectiveUser: function () { return user; },
    getScriptTimeZone: function () { return DEFAULT_TZ; }
  };

  /* ------------------------------------------------------------------ */
  /* Utilities.formatDate / parseDate (Java-style patterns)              */
  /* ------------------------------------------------------------------ */

  var formatters = {};
  function parts(date, tz) {
    tz = tz || DEFAULT_TZ;
    var f = formatters[tz] || (formatters[tz] = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }));
    var p = {};
    f.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, M: +p.month, d: +p.day, H: (+p.hour) % 24, m: +p.minute, s: +p.second };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function formatDate(date, tz, pattern) {
    if (!isDate(date)) throw new Error('Utilities.formatDate needs a Date.');
    var p = parts(date, tz);
    return pattern.replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|mm|ss/g, function (tok, literal) {
      if (literal !== undefined) return literal;
      switch (tok) {
        case 'yyyy': return String(p.y);
        case 'yy': return pad(p.y % 100);
        case 'MMMM': return MONTHS_LONG[p.M - 1];
        case 'MMM': return MONTHS[p.M - 1];
        case 'MM': return pad(p.M);
        case 'M': return String(p.M);
        case 'dd': return pad(p.d);
        case 'd': return String(p.d);
        case 'HH': return pad(p.H);
        case 'H': return String(p.H);
        case 'mm': return pad(p.m);
        case 'ss': return pad(p.s);
      }
      return tok;
    });
  }

  function offsetMs(utcMs, tz) {
    var p = parts(new Date(utcMs), tz);
    return Date.UTC(p.y, p.M - 1, p.d, p.H, p.m, p.s) - Math.floor(utcMs / 1000) * 1000;
  }

  function parseDate(text, tz, pattern) {
    var tokens = [];
    var source = '^' + pattern.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss|[.*+?^${}()|[\]\\]/g, function (tok, literal) {
      if (literal !== undefined) return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (tok.length === 1) return '\\' + tok;
      tokens.push(tok);
      return tok === 'yyyy' ? '(\\d{4})' : '(\\d{1,2})';
    }) + '$';
    var m = new RegExp(source).exec(String(text).trim());
    if (!m) throw new Error('Unparseable date: "' + text + '"');
    var p = { yyyy: 1970, MM: 1, dd: 1, HH: 0, mm: 0, ss: 0 };
    tokens.forEach(function (t, i) { p[t] = Number(m[i + 1]); });
    var guess = Date.UTC(p.yyyy, p.MM - 1, p.dd, p.HH, p.mm, p.ss);
    var t = guess - offsetMs(guess, tz);
    var again = offsetMs(t, tz);
    if (guess - again !== t) t = guess - again;
    return new Date(t);
  }

  g.Utilities = {
    formatDate: formatDate,
    parseDate: parseDate,
    getUuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); },
    sleep: function () {}
  };

  /* ------------------------------------------------------------------ */
  /* ScriptApp, HtmlService, Logger                                      */
  /* ------------------------------------------------------------------ */

  var triggers = [];
  g.ScriptApp = {
    getService: function () { return { getUrl: function () { return g.__RQ_URL__ || ''; } }; },
    getProjectTriggers: function () { return triggers.slice(); },
    deleteTrigger: function (t) { triggers = triggers.filter(function (x) { return x !== t; }); },
    newTrigger: function (fn) {
      var builder = {
        timeBased: function () { return builder; },
        everyHours: function () { return builder; },
        everyMinutes: function () { return builder; },
        create: function () { var t = { getHandlerFunction: function () { return fn; } }; triggers.push(t); return t; }
      };
      return builder;
    }
  };

  function htmlOutput(content) {
    var out = {
      _c: content || '',
      getContent: function () { return out._c; },
      setTitle: function () { return out; },
      addMetaTag: function () { return out; },
      setWidth: function () { return out; },
      setHeight: function () { return out; },
      setXFrameOptionsMode: function () { return out; }
    };
    return out;
  }
  g.HtmlService = {
    createHtmlOutput: htmlOutput,
    createHtmlOutputFromFile: function () { return htmlOutput(''); },
    createTemplateFromFile: function () { return { evaluate: function () { return htmlOutput(''); } }; },
    XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' }
  };

  g.Logger = { log: function () { if (g.console) g.console.log.apply(g.console, arguments); } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
