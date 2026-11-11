'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readPublicSheet } = require('../api/sheets');
const params = { id: 'abcdefghijklmnopqrstuvwxyz123456', gid: '0' };
test('public Sheets reader validates before making requests', async () => {
  for (const bad of [{ id: '../x' }, { id: 'https://example.org/' }, { gid: '-1' }, { gid: '0&url=x' }, { published: 'yes' }]) {
    await assert.rejects(readPublicSheet({ ...params, ...bad }, async () => { assert.fail('must not fetch'); }), /valid|invalid/i);
  }
});
test('only a bounded public CSV response is returned', async () => {
  const result = await readPublicSheet(params, async (url, options) => {
    assert.equal(url, 'https://docs.google.com/spreadsheets/d/' + params.id + '/export?format=csv&gid=0');
    assert.equal(options.redirect, 'manual');
    return new Response('Item,Qty\nRice,4', { headers: { 'content-type': 'text/csv' } });
  });
  assert.equal(result, 'Item,Qty\nRice,4');
});
test('private sheets, login HTML and off-site redirects give an export/paste fallback', async () => {
  for (const response of [new Response('', { status: 403 }), new Response('<!doctype html><html>Sign in</html>', { headers: { 'content-type': 'text/html' } }), new Response('', { status: 302, headers: { location: 'https://accounts.google.com/ServiceLogin' } }), new Response('', { status: 302, headers: { location: 'http://127.0.0.1/' } }), new Response('', { status: 302, headers: { location: 'https://docs.google.com.evil.test/' } })]) {
    await assert.rejects(readPublicSheet(params, async () => response), /export|paste/i);
  }
});
test('Google export redirects are followed, redirect loops and large bodies are rejected', async () => {
  let calls = 0;
  assert.equal(await readPublicSheet(params, async () => ++calls === 1 ? new Response('', { status: 302, headers: { location: 'https://doc-a-b-sheets.googleusercontent.com/export/file.csv' } }) : new Response('Item,Qty\nSoap,2', { headers: { 'content-type': 'text/csv' } })), 'Item,Qty\nSoap,2');
  await assert.rejects(readPublicSheet(params, async () => new Response('', { status: 302, headers: { location: '/loop' } })), /redirect/i);
  await assert.rejects(readPublicSheet(params, async () => new Response('x'.repeat(2000001), { headers: { 'content-type': 'text/csv' } })), /large/i);
});
test('a stalled source is aborted within its time budget', async () => {
  await assert.rejects(readPublicSheet(params, async (url, opts) => new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted')))), { timeoutMs: 10 }), /timed out/i);
});
