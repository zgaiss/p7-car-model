const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Spectrum = require('../app/src/main/assets/audio-spectrum-state.js');
const { State, readSettings, writeSettings, styles } = Spectrum;
const frame = value => Array(64).fill(value);
const playing = () => ({ status: 0 });

function zero(state) {
  assert.equal(state.energy, 0);
  assert.equal(state.active, false);
  assert.ok(state.values.every(value => value === 0));
}

function warmedState(value = 1) {
  const state = new State();
  const input = frame(value);
  state.update(0, input, undefined, true);
  state.update(160, input, undefined, true);
  return { state, input };
}

function storage(initial) {
  const entries = new Map(initial === undefined ? [] : [['p7.spectrum.v1', initial]]);
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

test('UMD attaches the same API in a browser without starting a render loop', () => {
  const context = { self: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/src/main/assets/audio-spectrum-state.js'), 'utf8'), context);
  assert.equal(typeof context.self.P7SpectrumState.State, 'function');
  assert.deepEqual(Array.from(context.self.P7SpectrumState.styles), ['bands', 'ribbon', 'terrain', 'led']);
  zero(new context.self.P7SpectrumState.State());
});

test('new state and absent inputs stay exactly silent; update returns the same state', () => {
  const state = new State();
  assert.ok(state.values instanceof Float32Array);
  assert.equal(state.values.length, 64);
  for (const time of [0, 16, 160, 1000, 10000]) assert.equal(state.update(time, undefined, undefined, true), state);
  zero(state);
});

test('160 ms input cadence interpolates on render frames without inventing energy', () => {
  const state = new State();
  const high = frame(0.8);
  const low = frame(0.2);
  state.update(0, high, undefined, true);
  assert.equal(state.energy, 0); // No elapsed time is invented at initialization.
  state.update(16, high, undefined, true);
  const first = state.values[0];
  state.update(32, high, undefined, true);
  assert.ok(first > 0 && first < state.values[0] && state.values[0] < 0.8);
  state.update(144, high, undefined, true);
  const peak = state.values[0];
  state.update(160, low, undefined, true);
  assert.ok(state.active);
  assert.ok(state.values[0] > 0.2 && state.values[0] < peak);
  state.update(176, low, undefined, true);
  assert.ok(state.values[0] > 0.2 && state.values[0] < peak);
  state.update(320, frame(0.4), undefined, true);
  assert.ok(state.active);
  assert.ok(state.values.every(value => value >= 0 && value <= 0.8));
});

test('attack is faster than release and both are independent of render frame rate', () => {
  function sample(step, value, initial) {
    const state = new State();
    const input = frame(value);
    state.update(0, input, undefined, true);
    state.values.fill(initial);
    for (let time = step; time <= 320; time += step) state.update(time, input, undefined, true);
    return state.values[0];
  }
  const fastAttack = sample(10, 1, 0);
  const lowFpsAttack = sample(160, 1, 0);
  const fastRelease = sample(10, 0, 1);
  const lowFpsRelease = sample(160, 0, 1);
  assert.ok(Math.abs(fastAttack - lowFpsAttack) < 1e-6);
  assert.ok(Math.abs(fastRelease - lowFpsRelease) < 1e-6);
  assert.ok(1 - fastAttack < fastRelease);
});

test('a repeated frame expires after 500 ms, while replacement arrays renew freshness', () => {
  const { state, input } = warmedState();
  state.update(500, input, undefined, true);
  assert.ok(state.active);
  state.update(501, input, undefined, true);
  assert.equal(state.active, false);
  state.update(2000, input, undefined, true);
  zero(state);
  state.update(2016, frame(1), undefined, true);
  assert.ok(state.active);
  assert.ok(state.energy > 0);
});

test('in-place mutation does not masquerade as a new native frame', () => {
  const { state, input } = warmedState();
  input.fill(0.2);
  state.update(501, input, undefined, true);
  assert.equal(state.active, false);
  state.update(2200, input, undefined, true);
  zero(state);
});

test('fresh media is replaced each second; stale media gates otherwise fresh audio after 2500 ms', () => {
  const state = new State();
  let media = playing();
  state.update(0, frame(1), media, true);
  for (let time = 160; time <= 2400; time += 160) {
    state.update(time, frame(1), media, true);
    assert.ok(state.active);
  }
  state.update(2500, frame(1), media, true);
  assert.ok(state.active);
  state.update(2501, frame(1), media, true);
  assert.equal(state.active, false);
  state.update(4200, frame(1), media, true);
  zero(state);
  media = playing();
  state.update(4216, frame(1), media, true);
  assert.ok(state.active);
  for (let time = 5216; time <= 9216; time += 1000) {
    state.update(time, frame(1), playing(), true);
    assert.ok(state.active);
  }
});

test('paused, stopped and malformed media statuses suppress new microphone energy', () => {
  for (const media of [{ status: 1 }, { status: 2 }, { status: -1 }, { status: '0' }, {}, [], 'playing']) {
    const { state } = warmedState();
    state.update(176, frame(1), media, true);
    assert.equal(state.active, false);
    state.update(1800, frame(1), media, true);
    zero(state);
  }
  const state = new State();
  state.update(0, frame(1), null, true);
  state.update(160, frame(1), null, true);
  assert.ok(state.active && state.energy > 0);
});

test('silence and disconnected frames release smoothly and settle at exact zero', () => {
  for (const input of [frame(0), undefined, null]) {
    const { state } = warmedState();
    const before = state.energy;
    state.update(176, input, undefined, true);
    assert.equal(state.active, false);
    assert.ok(state.energy > 0 && state.energy < before);
    state.update(1800, input, undefined, true);
    zero(state);
  }
});

test('strict 64-bin validation and per-bin sanitization keep all values finite and bounded', () => {
  const input = frame(0);
  [NaN, Infinity, -Infinity, -1, 2, '0.8', null, undefined, {}, true, 0.5].forEach((value, index) => { input[index] = value; });
  const state = new State();
  state.update(0, input, undefined, true);
  state.update(160, input, undefined, true);
  assert.ok(state.active);
  assert.ok(state.values.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  for (const index of [0, 1, 2, 3, 5, 6, 7, 8, 9]) assert.equal(state.values[index], 0);
  assert.ok(state.values[4] > 0.9 && state.values[10] > 0.4);
  assert.ok(Number.isFinite(state.energy));
  for (const bad of [[], frame(1).slice(1), [...frame(1), 1], '1'.repeat(64), { length: 64, 0: 1 }, new DataView(new ArrayBuffer(64))]) {
    state.reset().update(0, bad, undefined, true).update(160, bad, undefined, true);
    zero(state);
  }
  const typed = new Float32Array(64).fill(0.5);
  state.reset().update(0, typed, undefined, true).update(160, typed, undefined, true);
  assert.ok(state.active && state.energy > 0);
});

test('master off clears immediately and reset invalidates source references but keeps the public buffer', () => {
  const { state, input } = warmedState();
  const values = state.values;
  state.update(176, input, playing(), false);
  zero(state);
  assert.equal(state.values, values);
  state.update(200, input, undefined, true).update(216, input, undefined, true);
  assert.ok(state.active && state.energy > 0);
  assert.equal(state.reset(), state);
  zero(state);
  assert.equal(state.values, values);
  state.update(0, input, undefined, true).update(160, input, undefined, true);
  assert.ok(state.active && state.energy > 0);
});

test('a long low-FPS or suspended interval settles release; bad or backwards clocks never create NaN', () => {
  const { state, input } = warmedState();
  state.update(10000, input, undefined, true);
  zero(state);
  const fresh = frame(1);
  state.update(10016, fresh, undefined, true);
  const before = state.energy;
  for (const time of [NaN, Infinity, undefined, -1000, 1, '10032']) {
    state.update(time, fresh, undefined, true);
    assert.ok(state.values.every(Number.isFinite));
    assert.equal(state.energy, before);
  }
  state.update(10032, fresh, undefined, true);
  assert.ok(state.energy > before);
});

test('settings default safely and preserve all four valid styles and booleans', () => {
  assert.deepEqual(styles, ['bands', 'ribbon', 'terrain', 'led']);
  assert.ok(Object.isFrozen(styles));
  for (const style of styles) for (const enabled of [true, false]) {
    const store = storage();
    assert.equal(writeSettings(store, { enabled, style }), true);
    assert.equal(store.entries.size, 1);
    assert.equal(store.entries.get('p7.spectrum.v1'), JSON.stringify({ enabled, style }));
    assert.deepEqual(readSettings(store), { enabled, style });
  }
  assert.deepEqual(readSettings(storage()), { enabled: true, style: 'bands' });
});

test('malformed or partial settings validate each field, without truthiness coercion', () => {
  for (const invalid of ['broken JSON', 'null', '[]', 'true', '1', '"ribbon"']) {
    assert.deepEqual(readSettings(storage(invalid)), { enabled: true, style: 'bands' });
  }
  assert.deepEqual(readSettings(storage('{"enabled":false,"style":"unknown"}')), { enabled: false, style: 'bands' });
  assert.deepEqual(readSettings(storage('{"enabled":"false","style":"ribbon"}')), { enabled: true, style: 'ribbon' });
  assert.deepEqual(readSettings(storage('{"style":"led"}')), { enabled: true, style: 'led' });
  const store = storage();
  assert.ok(writeSettings(store, { enabled: 0, style: 'LED', extra: 'discard' }));
  assert.deepEqual(readSettings(store), { enabled: true, style: 'bands' });
  assert.equal(store.entries.get('p7.spectrum.v1'), '{"enabled":true,"style":"bands"}');
});

test('unavailable, blocked or full localStorage cannot break rendering or persistence callers', () => {
  const blocked = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  const getters = Object.defineProperties({}, { getItem: { get() { throw Error('denied'); } }, setItem: { get() { throw Error('denied'); } } });
  for (const store of [undefined, null, {}, blocked, getters]) {
    assert.deepEqual(readSettings(store), { enabled: true, style: 'bands' });
    assert.equal(writeSettings(store, { enabled: false, style: 'terrain' }), false);
  }
  const defaults = readSettings();
  defaults.style = 'ribbon';
  assert.equal(readSettings().style, 'bands');
});

test('native media heartbeat survives unavailable position; pause and bridge loss still gate fresh FFT', () => {
  const native = fs.readFileSync(require.resolve('../app/src/main/java/com/show/p7/MainActivity.java'), 'utf8');
  const match = native.match(/boolean timeElapsed = ([^;]+);/);
  assert.ok(match, 'native heartbeat expression is present');
  // Exercise the actual Java boolean expression (same arithmetic/boolean syntax),
  // rather than duplicating the desired condition in a test-only helper.
  const elapsed = new Function('pos', 'nowMs', 'lastLyricPushMs', 'return ' + match[1].replace(/(\d+)L\b/g, '$1'));
  assert.equal(elapsed(-1, 999, 0), false);
  assert.equal(elapsed(-1, 1000, 0), true);
  assert.match(native, /boolean statusChanged = \(status >= 0\) && \(status != lastPlayStatus\)/);
  assert.match(native, /if \(lyricChanged \|\| posDrifted \|\| timeElapsed \|\| statusChanged\)/);
  const state = new State();
  let media = { status: 0, pos: -1 }, lastPush = 0;
  for (let t = 0; t <= 6400; t += 160) {
    if (elapsed(-1, t, lastPush)) { media = { status: 0, pos: -1 }; lastPush = t; }
    state.update(t, frame(0.6), media, true);
    assert.equal(state.active, true, 'playing survives pos=-1 at ' + t);
  }
  // Status changes are pushed independently of position and the periodic timer.
  state.update(6416, frame(0.6), { status: 1, pos: -1 }, true);
  assert.equal(state.active, false);
  media = { status: 0, pos: -1 };
  state.update(6500, frame(0.6), media, true);
  assert.equal(state.active, true);
  // A broken media connection no longer replaces media, even if microphone FFT continues.
  for (let t = 6660; t <= 11000; t += 160) state.update(t, frame(0.6), media, true);
  zero(state);
});
