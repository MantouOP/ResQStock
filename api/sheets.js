'use strict';
// Demo-only public Sheets reader. No credentials, arbitrary URLs or private proxy.
const FALLBACK = 'This link is not available as a public spreadsheet. Export it as CSV/XLSX or copy and paste its cells.';
const MAX_BYTES = 2000000;
function allowedExport(url) {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (url.hostname === 'docs.google.com' || /^doc-[a-z0-9-]+-sheets\.googleusercontent\.com$/.test(url.hostname));
}
async function readPublicSheet(params, fetcher = fetch, options = {}) {
  const id = params.id, gid = params.gid === undefined ? '0' : params.gid;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{20,180}$/.test(id) || typeof gid !== 'string' || !/^\d{1,15}$/.test(gid) || (params.published !== undefined && params.published !== '1')) throw new Error('Use a valid Google Sheets link.');
  let url = new URL(params.published === '1' ? 'https://docs.google.com/spreadsheets/d/e/' + id + '/pub?output=csv&single=true&gid=' + gid : 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=csv&gid=' + gid);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!allowedExport(url)) throw new Error(FALLBACK);
      const response = await fetcher(url.href, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/csv,text/plain;q=0.9' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = response.headers.get('location');
        if (response.body) await response.body.cancel();
        if (!next) throw new Error(FALLBACK);
        url = new URL(next, url);
        continue;
      }
      const type = response.headers.get('content-type') || '';
      if (response.status !== 200 || !/^(text\/(csv|plain)|application\/(csv|octet-stream))(?:;|$)/i.test(type)) {
        if (response.body) await response.body.cancel();
        throw new Error(FALLBACK);
      }
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        if (response.body) await response.body.cancel();
        throw new Error('This sheet is too large. Paste a smaller selection.');
      }
      if (!response.body) throw new Error('This worksheet is empty.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let bytes = 0, text = '';
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > MAX_BYTES) throw new Error('This sheet is too large. Paste a smaller selection.');
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally { await reader.cancel(); }
      if (/^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(text)) throw new Error(FALLBACK);
      return text;
    }
    throw new Error('Too many export redirects. Export the file or paste its cells.');
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Google Sheets timed out. Try again, or export and upload the file.');
    throw error;
  } finally { clearTimeout(timer); }
}
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.statusCode = 405; return res.end('Method not allowed'); }
  try {
    const query = new URL(req.url, 'https://resqstock.invalid').searchParams;
    if (['id', 'gid', 'published'].some(k => query.getAll(k).length > 1)) throw new Error('Use a valid Google Sheets link.');
    const params = Object.fromEntries(query);
    const csv = await readPublicSheet(params);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.end(csv);
  } catch (error) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error.message || FALLBACK }));
  }
}
module.exports = handler;
module.exports.readPublicSheet = readPublicSheet;
