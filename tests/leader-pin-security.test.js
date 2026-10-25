'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handler = require('../api/leader-pin-rotation');
const { isEnabled, validate } = handler._test;

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NEXT_TOKEN = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SAMPLE = 'test-only-not-a-real-password';

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('feature flag enables rotation only on approved production environment', () => {
  assert.equal(isEnabled({ VERCEL_ENV: 'preview', DXN_LEADER_PIN_ROTATION_ENABLED: 'true' }), false);
  assert.equal(isEnabled({ VERCEL_ENV: 'production', DXN_LEADER_PIN_ROTATION_ENABLED: 'false' }), false);
  assert.equal(isEnabled({ VERCEL_ENV: 'production', DXN_LEADER_PIN_ROTATION_ENABLED: 'true' }), true);
});

test('input validation rejects missing token, weak and reused passwords', () => {
  assert.match(validate({ token: 'bad', current_pin: SAMPLE, new_pin: SAMPLE + '-new' }), /جلسة/);
  assert.match(validate({ token: TOKEN, current_pin: SAMPLE, new_pin: 'short' }), /12/);
  assert.match(validate({ token: TOKEN, current_pin: SAMPLE, new_pin: SAMPLE }), /تختلف/);
  assert.equal(validate({ token: TOKEN, current_pin: SAMPLE, new_pin: SAMPLE + '-new' }), null);
});

test('all preview POST attempts are blocked before reaching Supabase', async () => {
  const previous = { ...process.env };
  const fetchBefore = global.fetch;
  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.DXN_LEADER_PIN_ROTATION_ENABLED = 'true';
    global.fetch = () => { throw new Error('preview must never contact production'); };
    const res = fakeResponse();
    await handler({ method: 'POST', body: {
      token: TOKEN, current_pin: SAMPLE, new_pin: SAMPLE + '-new'
    } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'preview_only');
  } finally {
    process.env = previous;
    global.fetch = fetchBefore;
  }
});

test('approved production request uses a server-side key and never returns a PIN', async () => {
  const previous = { ...process.env };
  const fetchBefore = global.fetch;
  try {
    process.env.VERCEL_ENV = 'production';
    process.env.DXN_LEADER_PIN_ROTATION_ENABLED = 'true';
    process.env.SUPABASE_SECRET_KEY = 'unit-test-server-key';
    global.fetch = async (url, options) => {
      assert.match(url, /\/rest\/v1\/rpc\/leader_rotate_pin$/);
      assert.equal(options.headers.apikey, 'unit-test-server-key');
      const request = JSON.parse(options.body);
      assert.equal(request.p_token, TOKEN);
      assert.equal(request.p_current_pin, SAMPLE);
      assert.equal(request.p_new_pin, SAMPLE + '-new');
      return { ok: true, json: async () => ({ ok: true, token: NEXT_TOKEN, revoked_sessions: 18 }) };
    };

    const res = fakeResponse();
    await handler({ method: 'POST', body: {
      token: TOKEN, current_pin: SAMPLE, new_pin: SAMPLE + '-new'
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.token, NEXT_TOKEN);
    assert.equal(res.body.revoked_sessions, 18);
    assert.equal(JSON.stringify(res.body).includes(SAMPLE), false);
  } finally {
    process.env = previous;
    global.fetch = fetchBefore;
  }
});

test('modern Supabase secret key is not sent as a JWT bearer token', async () => {
  const previous = { ...process.env };
  const fetchBefore = global.fetch;
  try {
    process.env.VERCEL_ENV = 'production';
    process.env.DXN_LEADER_PIN_ROTATION_ENABLED = 'true';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_unit_test_only';
    global.fetch = async (_url, options) => {
      assert.equal(options.headers.apikey, 'sb_secret_unit_test_only');
      assert.equal(options.headers.Authorization, undefined);
      return { ok: true, json: async () => ({ ok: true, token: NEXT_TOKEN, revoked_sessions: 3 }) };
    };
    const res = fakeResponse();
    await handler({ method: 'POST', body: {
      token: TOKEN, current_pin: SAMPLE, new_pin: SAMPLE + '-new'
    } }, res);
    assert.equal(res.statusCode, 200);
  } finally {
    process.env = previous;
    global.fetch = fetchBefore;
  }
});

test('app page loads security panel after the existing leader UI', () => {
  const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');
  assert.match(html, /leader-pin-security\.js\?v=/);
  assert.match(html, /onclick="changePin\(\)"/);
  const script = fs.readFileSync(path.join(__dirname, '../app/leader-pin-security.js'), 'utf8');
  assert.match(script, /window\.changePin = openDialog/);
  assert.match(script, /disabled = !enabled/);
});
