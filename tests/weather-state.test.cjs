const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Weather = require('../app/src/main/assets/weather-state.js');
const NOW = Date.UTC(2026, 9, 17, 12, 0);
const options = { now: NOW, sceneNight: true, timeSyncOn: true };
const state = changes => Object.assign({
  enabled: true, consented: true, status: 'ready', observedAt: NOW,
  fetchedAt: NOW, weatherCode: 61, isDay: false, precipitation: 0.5,
  windSpeed: 15, windGusts: 30, windDirection: 90, stale: false,
  error: null, source: 'Open-Meteo'
}, changes);
function none(visual) {
  assert.equal(visual.active, false);
  assert.equal(visual.effect, 'none');
  assert.equal(visual.intensity, 0);
  assert.equal(visual.skyHint, null);
  assert.equal(visual.wind.strength, 0);
  assert.equal(visual.wind.gustStrength, 0);
  assert.equal(visual.wind.direction, null);
}

test('UMD works without a DOM or any external effects; default is strictly off', () => {
  const context = { self: {} };
  const source = fs.readFileSync(require.resolve('../app/src/main/assets/weather-state.js'), 'utf8');
  vm.runInNewContext(source, context);
  const api = context.self.WeatherState;
  assert.equal(typeof api.derive, 'function');
  assert.equal(typeof api.createStore, 'function');
  none(api.createStore().getVisual(options));
  assert.doesNotMatch(source, /requestAnimationFrame|setInterval|setTimeout|fetch\(|XMLHttpRequest|geolocation|localStorage/);
  assert.equal(Weather.STALE_MS, 30 * 60 * 1000);
  assert.equal(Weather.EXPIRE_MS, 60 * 60 * 1000);
});

test('explicit enablement and consent are both required; truthy strings do not enable', () => {
  for (const enabled of [undefined, null, false, 0, 1, 'true', 'false']) none(Weather.derive(state({ enabled }), options));
  for (const consented of [undefined, null, false, 0, 1, 'true']) none(Weather.derive(state({ consented }), options));
  assert.equal(Weather.derive(state(), options).effect, 'rain');
});

test('WMO drizzle, freezing rain, rain/showers and thunderstorms all map to rain', () => {
  for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 97, 99]) {
    const visual = Weather.derive(state({ weatherCode: code }), options);
    assert.equal(visual.effect, 'rain', String(code));
    assert.ok(visual.intensity >= 0.3 && visual.intensity <= 1);
  }
});

test('all six snow codes and both fog codes map explicitly', () => {
  for (const code of [71, 73, 75, 77, 85, 86]) assert.equal(Weather.derive(state({ weatherCode: code }), options).effect, 'snow');
  for (const code of [45, 48]) assert.equal(Weather.derive(state({ weatherCode: code }), options).effect, 'fog');
  for (const code of [2, 3]) {
    const visual = Weather.derive(state({ weatherCode: code }), options);
    assert.equal(visual.effect, 'none');
    assert.equal(visual.active, true);
  }
});

test('only clear/mainly-clear real nights in a selected night scene produce stars', () => {
  for (const code of [0, 1]) {
    for (const isDay of [false, 0]) {
      assert.equal(Weather.derive(state({ weatherCode: code, isDay }), options).effect, 'stars');
      assert.equal(Weather.derive(state({ weatherCode: code, isDay }), { ...options, sceneNight: false }).effect, 'none');
    }
    for (const isDay of [true, 1, null, undefined, 'false', '0', -1, 2, {}]) {
      assert.equal(Weather.derive(state({ weatherCode: code, isDay }), options).effect, 'none');
    }
  }
  assert.equal(Weather.derive(state({ weatherCode: 0 }), { now: NOW }).effect, 'none');
});

test('day/night hint requires sync, valid daylight and fresh data, and never overrides manual scenes', () => {
  for (const [isDay, skyHint] of [[true, 'daylight'], [1, 'daylight'], [false, 'night'], [0, 'night']]) {
    assert.equal(Weather.derive(state({ isDay }), options).skyHint, skyHint);
    assert.equal(Weather.derive(state({ isDay }), { ...options, manualOverride: true }).skyHint, null);
    for (const timeSyncOn of [false, undefined, 'true', 1]) {
      assert.equal(Weather.derive(state({ isDay }), { ...options, timeSyncOn }).skyHint, null);
    }
  }
  assert.equal(Weather.derive(state({ isDay: null }), options).skyHint, null);
  assert.equal(Weather.derive(state({ stale: true }), options).skyHint, null);
  assert.equal(Weather.derive(state({ weatherCode: 0, isDay: true }), { ...options, manualOverride: true }).effect, 'none');
  assert.equal(Weather.derive(state({ weatherCode: 0, isDay: false }), { ...options, sceneNight: false, manualOverride: true }).effect, 'none');
});

test('permission, consent, disabled location, paused and unknown status suppress every output', () => {
  for (const status of ['disabled', 'off', 'paused', 'permission_required', 'permission_denied', 'location_disabled',
    'consent_required', 'unknown', 'future_status', '', 'READY', '__proto__', 'constructor', {}, null]) {
    none(Weather.derive(state({ status }), options));
  }
});

test('unrecognized/invalid weather codes never become clear sky or a precipitation guess', () => {
  for (const weatherCode of [undefined, null, -1, 4, 44, 50, 60, 72, 84, 98, 100, Infinity, NaN, '0', '61', 0.1, {}, []]) {
    const visual = Weather.derive(state({ weatherCode, precipitation: 999 }), options);
    none(visual);
    assert.equal(visual.reason, 'unknown_weather');
  }
});

test('cached network/location failures retain bounded rain, snow or fog but never invent sunshine', () => {
  for (const status of ['offline', 'network_error', 'location_error', 'location_unavailable', 'error', 'timeout']) {
    const visual = Weather.derive(state({ status }), options);
    assert.equal(visual.effect, 'rain');
    assert.equal(visual.stale, true);
    assert.equal(visual.skyHint, null);
    assert.equal(Weather.derive(state({ status, weatherCode: 0 }), options).effect, 'none');
    assert.equal(Weather.derive(state({ status, weatherCode: 71 }), options).effect, 'snow');
    assert.equal(Weather.derive(state({ status, weatherCode: 45 }), options).effect, 'fog');
    none(Weather.derive({ enabled: true, consented: true, status }, options));
  }
  assert.equal(Weather.derive(state({ weatherCode: 0, error: 'network' }), options).effect, 'none');
  assert.equal(Weather.derive(state({ weatherCode: 0, error: true }), options).effect, 'none');
  assert.equal(Weather.derive(state({ weatherCode: 0, error: {} }), options).effect, 'none');
  none(Weather.derive(state({ status: 'location_unavailable', error: 'location_provider_disabled' }), options));
});

test('loading/locating refreshes preserve valid cached visuals without inventing a first sample', () => {
  for (const status of ['loading', 'locating', 'refreshing']) {
    assert.equal(Weather.derive(state({ status }), options).effect, 'rain');
    assert.equal(Weather.derive(state({ status, weatherCode: 0 }), options).effect, 'stars');
    none(Weather.derive({ enabled: true, consented: true, status }, options));
    none(Weather.derive(state({ status, observedAt: NOW - Weather.EXPIRE_MS - 1 }), options));
  }
});

test('30/60 minute boundaries use observation age, including old observations freshly fetched', () => {
  const store = Weather.createStore(state());
  assert.equal(store.getVisual({ ...options, now: NOW + Weather.STALE_MS }).stale, false);
  const stale = store.getVisual({ ...options, now: NOW + Weather.STALE_MS + 1 });
  assert.equal(stale.stale, true);
  assert.equal(stale.effect, 'rain');
  assert.equal(stale.skyHint, null);
  assert.equal(store.getVisual({ ...options, now: NOW + Weather.EXPIRE_MS }).effect, 'rain');
  const expired = store.getVisual({ ...options, now: NOW + Weather.EXPIRE_MS + 1 });
  none(expired);
  assert.equal(expired.expired, true);
  assert.equal(expired.stale, true);
  none(Weather.derive(state({ observedAt: NOW - Weather.EXPIRE_MS - 1 }), options));
  assert.equal(Weather.derive(state({ status: 'stale' }), options).stale, true);
  assert.equal(Weather.derive(state({ status: 'refreshing' }), options).effect, 'rain');
});

test('invalid, second-based and materially future timestamps fail closed', () => {
  for (const bad of [undefined, null, NaN, Infinity, -1, 0, NOW + 0.5, String(NOW), {}]) {
    none(Weather.derive(state({ observedAt: bad }), options));
    none(Weather.derive(state({ fetchedAt: bad }), options));
  }
  none(Weather.derive(state({ observedAt: NOW / 1000, fetchedAt: NOW / 1000 }), options));
  none(Weather.derive(state({ observedAt: NOW + Weather.CLOCK_SKEW_MS + 1 }), options));
  none(Weather.derive(state({ fetchedAt: NOW + Weather.CLOCK_SKEW_MS + 1 }), options));
  none(Weather.derive(state({ observedAt: NOW, fetchedAt: NOW - Weather.CLOCK_SKEW_MS - 1 }), options));
  assert.equal(Weather.derive(state({ observedAt: NOW + 1000, fetchedAt: NOW + 1000 }), options).ageMs, 0);
  for (const now of [null, NaN, Infinity, -1, 'now']) none(Weather.derive(state(), { ...options, now }));
});

test('wind and precipitation map to finite bounded artistic parameters, not screen compass vectors', () => {
  const calm = Weather.derive(state({ windSpeed: 0, windGusts: 0 }), options);
  assert.equal(calm.wind.strength, 0);
  assert.equal(calm.wind.gustStrength, 0);
  const windy = Weather.derive(state({ windSpeed: 30, windGusts: 80, windDirection: 360, precipitation: 1e300 }), options);
  assert.equal(windy.wind.strength, 42.5 / 60);
  assert.equal(windy.wind.gustStrength, 1);
  assert.equal(windy.wind.direction, 0);
  assert.equal(windy.wind.decorative, true);
  assert.equal(windy.intensity, 1);
  for (const bad of [NaN, Infinity, -1, '80', {}, []]) {
    const visual = Weather.derive(state({ windSpeed: bad, windGusts: bad, windDirection: bad, precipitation: bad }), options);
    assert.equal(visual.wind.strength, 0);
    assert.equal(visual.wind.gustStrength, 0);
    assert.equal(visual.wind.direction, null);
    assert.ok(Number.isFinite(visual.intensity));
  }
  assert.equal(Weather.derive(state({ windSpeed: 1e300, windGusts: 1e300 }), options).wind.strength, 1);
  assert.equal(Weather.derive(state({ windDirection: 361 }), options).wind.direction, null);
  assert.ok(Weather.derive(state({ windSpeed: 0, windGusts: 40 }), options).wind.strength > calm.wind.strength);
});

test('malicious payloads and getters cannot execute or pollute the prototype', () => {
  const badInputs = [null, undefined, true, 7, 'ready', '{}', [], () => {}, new Date()];
  for (const input of badInputs) none(Weather.derive(input, options));
  let invoked = 0;
  const evil = Object.defineProperty({}, 'enabled', { get() { invoked++; throw Error('getter'); } });
  none(Weather.derive(evil, options));
  const inherited = Object.create(state());
  none(Weather.derive(inherited, options));
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  none(Weather.derive(revoked.proxy, options));
  const polluted = JSON.parse('{"__proto__":{"enabled":true,"consented":true},"constructor":{"prototype":{"polluted":true}}}');
  none(Weather.derive(polluted, options));
  assert.equal({}.polluted, undefined);
  assert.equal(invoked, 0);
  const opts = Object.defineProperty({ now: NOW }, 'sceneNight', { get() { invoked++; return true; } });
  assert.equal(Weather.derive(state({ weatherCode: 0 }), opts).effect, 'none');
  assert.equal(invoked, 0);
});

test('store snapshots are isolated and replacement does not merge old weather fields', () => {
  const input = state();
  const store = Weather.createStore(input);
  input.weatherCode = 75;
  assert.equal(store.getVisual(options).effect, 'rain');
  assert.equal(Object.isFrozen(store.getState()), true);
  store.getState().weatherCode = 75;
  assert.equal(store.getVisual(options).effect, 'rain');
  assert.equal(store.ingest({ enabled: true, consented: true, status: 'ready' }), true);
  none(store.getVisual(options));
  assert.equal(store.getState().weatherCode, null);
  assert.equal(store.ingest('invalid'), false);
  assert.equal(store.getState().weatherCode, null);
});

test('latest generation wins across disable/re-enable and stale callbacks cannot resurrect effects', () => {
  const store = Weather.createStore(state({ generation: 10, updatedAt: NOW }));
  assert.equal(store.ingest(state({ enabled: false, generation: 11, updatedAt: NOW + 1 })), true);
  none(store.getVisual(options));
  assert.equal(store.ingest(state({ generation: 10, updatedAt: NOW + 999 })), false);
  assert.equal(store.ingest(state({ generation: 11, updatedAt: NOW })), false);
  assert.equal(store.ingest(state({ generation: 11, updatedAt: NOW + 1 })), false);
  none(store.getVisual(options));
  assert.equal(store.ingest(state({ generation: 12, updatedAt: NOW + 2, weatherCode: 73 })), true);
  assert.equal(store.getVisual(options).effect, 'snow');
  assert.equal(store.ingest(state({ enabled: false, generation: 11, updatedAt: NOW + 3 })), false);
  assert.equal(store.getVisual(options).effect, 'snow');
});

test('updatedAt rejects same-generation races, metadata omission and invalid sequence values', () => {
  const store = Weather.createStore(state({ generation: 1, updatedAt: NOW }));
  assert.equal(store.ingest(state({ generation: 1, updatedAt: NOW + 2, weatherCode: 75 })), true);
  assert.equal(store.ingest(state({ generation: 1, updatedAt: NOW + 1, weatherCode: 61 })), false);
  assert.equal(store.ingest(state({ generation: 1 })), false);
  assert.equal(store.ingest(state({ updatedAt: NOW + 3 })), false);
  for (const generation of [-1, NaN, Infinity, 1.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(store.ingest(state({ generation, updatedAt: NOW + 3 })), false);
  }
  for (const updatedAt of [-1, NaN, Infinity, NOW + 0.1, String(NOW)]) {
    assert.equal(store.ingest(state({ generation: 1, updatedAt })), false);
  }
  assert.equal(store.getVisual(options).effect, 'snow');
  assert.equal(store.ingest(state({ enabled: false })), true);
  none(store.getVisual(options));
  assert.equal(store.ingest(state({ generation: 1 })), false);
});

test('timestamp fallback rejects older fetches while unsequenced permission revocation takes effect', () => {
  const store = Weather.createStore(state({ fetchedAt: NOW }));
  assert.equal(store.ingest(state({ fetchedAt: NOW - 1, weatherCode: 75 })), false);
  assert.equal(store.ingest(state({ status: 'permission_denied' })), true);
  none(store.getVisual(options));
  assert.equal(store.ingest(state({ status: 'location_disabled' })), true);
  none(store.getVisual(options));
  assert.equal(store.ingest({ enabled: false }), true);
  none(store.getVisual(options));
});

test('native revision/emittedAt reject late pushes and duplicate revisions after a toggle', () => {
  const store = Weather.createStore(state({ revision: 1, emittedAt: NOW }));
  assert.equal(store.ingest(state({ revision: 3, emittedAt: NOW + 2, enabled: false })), true);
  assert.equal(store.ingest(state({ revision: 2, emittedAt: NOW + 1 })), false);
  assert.equal(store.ingest(state({ revision: 3, emittedAt: NOW + 3 })), false);
  assert.equal(store.ingest(state({ emittedAt: NOW + 4 })), false);
  none(store.getVisual(options));
  assert.equal(store.ingest(state({ revision: 4, emittedAt: NOW + 4, weatherCode: 75 })), true);
  assert.equal(store.getVisual(options).effect, 'snow');
  assert.equal(store.getState().revision, 4);
  assert.equal(store.getState().emittedAt, NOW + 4);
  // A wall-clock correction cannot make a newer native decision disappear.
  assert.equal(store.ingest(state({ revision: 5, emittedAt: NOW - 1000, weatherCode: 45 })), true);
  assert.equal(store.getVisual(options).effect, 'fog');
  assert.equal(store.ingest(state({ revision: 1, emittedAt: NOW + 5, enabled: false })), false);
});

test('emittedAt works without sequence metadata and malformed native revisions are ignored', () => {
  const store = Weather.createStore(state({ emittedAt: NOW }));
  assert.equal(store.ingest(state({ emittedAt: NOW - 1, weatherCode: 75 })), false);
  assert.equal(store.ingest(state({ emittedAt: NOW + 1, weatherCode: 75 })), true);
  assert.equal(store.getVisual(options).effect, 'snow');
  for (const revision of [-1, NaN, Infinity, 1.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(store.ingest(state({ revision, emittedAt: NOW + 2 })), false);
  }
  for (const emittedAt of [-1, NaN, Infinity, NOW + 0.1, String(NOW)]) {
    assert.equal(store.ingest(state({ revision: 1, emittedAt })), false);
  }
});
test('stale effects reduce continuously before expiration',()=>{const fresh=Weather.derive(state({weatherCode:63}),options);const stale=Weather.derive(state({weatherCode:63,stale:true}),options);const old=Weather.derive(state({weatherCode:63,observedAt:NOW-59*60000,fetchedAt:NOW-59*60000}),options);assert.ok(stale.intensity<fresh.intensity);assert.ok(old.intensity<stale.intensity);assert.ok(old.intensity>=0);});
