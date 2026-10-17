/* Native weather snapshots only. The scene owns timing, rendering and settings.
 * WMO codes/units: https://open-meteo.com/en/docs (checked 2026-10-17).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WeatherState = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STALE_MS = 30 * 60 * 1000;
  var EXPIRE_MS = 60 * 60 * 1000;
  var CLOCK_SKEW_MS = 5 * 60 * 1000;
  var MAX_TIME = 8640000000000000;
  var MAX_INTEGER = 9007199254740991;
  var FIELDS = ['enabled', 'consented', 'status', 'observedAt', 'fetchedAt',
    'weatherCode', 'isDay', 'precipitation', 'windSpeed', 'windDirection',
    'windGusts', 'stale', 'error', 'source', 'generation', 'updatedAt', 'revision', 'emittedAt'];
  var READY = ['ready', 'ok', 'success', 'fresh'];
  var REFRESHING = ['refreshing', 'loading', 'locating'];
  var CACHED = ['stale', 'offline', 'network_error', 'location_unavailable',
    'location_error', 'error', 'timeout'].concat(REFRESHING);
  var BLOCKED = ['disabled', 'off', 'paused', 'permission_required',
    'permission_denied', 'location_disabled', 'consent_required'];
  var RAIN = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 97, 99];
  var SNOW = [71, 73, 75, 77, 85, 86];
  var KNOWN = [0, 1, 2, 3, 45, 48].concat(RAIN, SNOW);

  function finite(value) { return typeof value === 'number' && isFinite(value); }
  function time(value) {
    return finite(value) && value > 0 && value <= MAX_TIME && Math.floor(value) === value;
  }
  function integer(value) {
    return finite(value) && value >= 0 && value <= MAX_INTEGER && Math.floor(value) === value;
  }
  function contains(list, value) { return list.indexOf(value) !== -1; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function nonnegative(value) { return finite(value) && value >= 0 ? value : null; }
  function own(record, key) {
    var descriptor = Object.getOwnPropertyDescriptor(record, key);
    // Never evaluate bridge input getters or inherited fields.
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  }
  function readRecord(input, fields) {
    if (!input || typeof input !== 'object') return null;
    try {
      if (Array.isArray(input)) return null;
      var result = {};
      for (var i = 0; i < fields.length; i++) result[fields[i]] = own(input, fields[i]);
      return result;
    } catch (_) { return null; }
  }
  function snapshot(input) {
    var raw = readRecord(input, FIELDS);
    if (!raw || typeof raw.enabled !== 'boolean') return null;
    if (raw.generation !== undefined && raw.generation !== null && !integer(raw.generation)) return null;
    if (raw.revision !== undefined && raw.revision !== null && !integer(raw.revision)) return null;
    if (raw.updatedAt !== undefined && raw.updatedAt !== null && !time(raw.updatedAt)) return null;
    if (raw.emittedAt !== undefined && raw.emittedAt !== null && !time(raw.emittedAt)) return null;
    return Object.freeze({
      enabled: raw.enabled === true,
      consented: raw.consented === true,
      status: typeof raw.status === 'string' && /^[a-z_]{1,40}$/.test(raw.status) ? raw.status : 'unknown',
      observedAt: time(raw.observedAt) ? raw.observedAt : null,
      fetchedAt: time(raw.fetchedAt) ? raw.fetchedAt : null,
      weatherCode: integer(raw.weatherCode) && contains(KNOWN, raw.weatherCode) ? raw.weatherCode : null,
      isDay: raw.isDay === true || raw.isDay === 1 ? true : raw.isDay === false || raw.isDay === 0 ? false : null,
      precipitation: nonnegative(raw.precipitation),
      windSpeed: nonnegative(raw.windSpeed),
      windGusts: nonnegative(raw.windGusts),
      windDirection: finite(raw.windDirection) && raw.windDirection >= 0 && raw.windDirection <= 360 ? raw.windDirection % 360 : null,
      stale: raw.stale === true,
      error: typeof raw.error === 'string' && raw.error.length ? raw.error.slice(0, 256) :
        raw.error == null || raw.error === false || raw.error === '' ? null : 'invalid_error',
      source: raw.source === 'Open-Meteo' ? 'Open-Meteo' : null,
      generation: integer(raw.generation) ? raw.generation : null,
      updatedAt: time(raw.updatedAt) ? raw.updatedAt : null,
      revision: integer(raw.revision) ? raw.revision : null,
      emittedAt: time(raw.emittedAt) ? raw.emittedAt : null
    });
  }
  function empty(state) {
    return {
      enabled: !!(state && state.enabled), active: false,
      status: state ? state.status : 'disabled', stale: !!(state && state.stale),
      expired: false, ageMs: null, effect: 'none', skyHint: null, intensity: 0,
      wind: { strength: 0, gustStrength: 0, direction: null, decorative: true },
      reason: 'disabled'
    };
  }
  function weatherKind(code) {
    if (contains(RAIN, code)) return 'rain';
    if (contains(SNOW, code)) return 'snow';
    if (code === 45 || code === 48) return 'fog';
    return 'none';
  }
  function effectIntensity(kind, state) {
    if (kind === 'none') return 0;
    if (kind === 'stars') return 0.65;
    if (kind === 'fog') return state.weatherCode === 48 ? 0.55 : 0.45;
    // Bounded artistic density, not a physical precipitation-rate conversion.
    var base = contains([65, 67, 75, 82, 86, 95, 96, 97, 99], state.weatherCode) ? 0.8 :
      contains([53, 55, 57, 63, 73, 81], state.weatherCode) ? 0.55 : 0.3;
    return clamp(Math.max(base, state.precipitation === null ? 0 : state.precipitation / 8), 0, 1);
  }

  /**
   * derive(state, { now?, sceneNight?, timeSyncOn?, manualOverride? })
   * All timestamps are UTC epoch milliseconds, never the scene's monotonic clock.
   * `active` means usable weather data; overcast/daylight may still have no effect.
   * `sceneNight` is the caller's actual chosen scene, including manual overrides.
   * No output changes that scene. A fresh skyHint is advisory and requires sync.
   */
  function derive(input, options) {
    var state = snapshot(input), visual = empty(state);
    if (!state) { visual.reason = input == null ? 'disabled' : 'invalid_payload'; return visual; }
    if (!state.enabled) return visual;
    if (!state.consented) { visual.reason = 'consent_required'; return visual; }
    if (contains(BLOCKED, state.status)) { visual.reason = state.status; return visual; }
    if (state.error === 'location_provider_disabled') { visual.reason = 'location_disabled'; return visual; }
    var ready = contains(READY, state.status), cached = contains(CACHED, state.status);
    if (!ready && !cached) { visual.reason = 'unavailable'; return visual; }

    var opts = readRecord(options, ['now', 'sceneNight', 'timeSyncOn', 'manualOverride']) || {};
    var now = opts.now === undefined ? Date.now() : opts.now;
    if (!time(now)) { visual.reason = 'invalid_now'; return visual; }
    if (!time(state.observedAt) || !time(state.fetchedAt) ||
        state.observedAt > now + CLOCK_SKEW_MS || state.fetchedAt > now + CLOCK_SKEW_MS ||
        state.observedAt > state.fetchedAt + CLOCK_SKEW_MS) {
      visual.stale = true; visual.reason = 'invalid_time'; return visual;
    }
    // Re-fetching an old observation must never rejuvenate its age.
    visual.ageMs = Math.max(0, now - Math.min(state.observedAt, state.fetchedAt));
    var failed = !!state.error || (cached && !contains(REFRESHING, state.status) && state.status !== 'stale');
    visual.stale = state.stale || failed || state.status === 'stale' || visual.ageMs > STALE_MS;
    visual.expired = visual.ageMs > EXPIRE_MS;
    if (visual.expired) { visual.reason = 'expired'; return visual; }
    if (state.weatherCode === null) { visual.reason = 'unknown_weather'; return visual; }

    visual.active = true;
    visual.reason = visual.stale ? 'stale' : 'ready';
    visual.effect = weatherKind(state.weatherCode);
    // Offline/error is not evidence of clear skies. Also require both real night
    // and the selected night scene; a manual night scene cannot invent stars.
    if (!failed && (state.weatherCode === 0 || state.weatherCode === 1) &&
        state.isDay === false && opts.sceneNight === true) visual.effect = 'stars';
    visual.intensity = effectIntensity(visual.effect, state);
    if(visual.stale)visual.intensity *= Math.min(.65, Math.max(0, (EXPIRE_MS-visual.ageMs)/(EXPIRE_MS-STALE_MS)));
    if (!visual.stale && !failed && state.isDay !== null &&
        opts.timeSyncOn === true && opts.manualOverride !== true) {
      visual.skyHint = state.isDay ? 'daylight' : 'night';
    }
    var speed = state.windSpeed === null ? 0 : state.windSpeed;
    var gust = state.windGusts === null ? speed : Math.max(speed, state.windGusts);
    visual.wind.strength = clamp((speed * 0.75 + gust * 0.25) / 60, 0, 1);
    visual.wind.gustStrength = clamp(gust / 80, 0, 1);
    // Meteorological degrees are source metadata only, not a screen compass.
    // Any screen-space drift derived from this value is decorative.
    visual.wind.direction = state.windDirection;
    return visual;
  }

  /**
   * createStore(initial?) => { ingest(snapshot): boolean, getState(), getVisual(options) }
   * Native increments revision for each event and includes emittedAt. Revision
   * wins over wall-clock changes; duplicate/older pushes are ignored. Optional
   * generation/updatedAt ordering is supported for other native adapters.
   * Without sequence metadata only fetchedAt/arrival ordering is possible: native
   * must cancel or invalidate old requests when permission/settings change.
   * Every accepted payload replaces the whole snapshot; values are never merged.
   */
  function createStore(initial) {
    var current = null, generation = null, revision = null, sequence = null, fetchedAt = null;
    function ingest(input) {
      var next = snapshot(input);
      if (!next) return false;
      var safetyStop = !next.enabled || !next.consented || contains(BLOCKED, next.status);
      if (sequence !== null && next.revision !== null && next.revision <= sequence) return false;
      if (sequence !== null && next.revision === null && !safetyStop) return false;
      if (generation !== null && next.generation !== null && next.generation < generation) return false;
      if (generation !== null && next.generation === null && !safetyStop) return false;
      var newGeneration = next.generation !== null && (generation === null || next.generation > generation);
      var nextTime = next.updatedAt !== null ? next.updatedAt : next.emittedAt;
      if (!newGeneration && next.revision === null) {
        if (revision !== null && nextTime !== null && nextTime < revision) return false;
        if (revision !== null && nextTime === null && !safetyStop) return false;
        if (nextTime === null && revision === null && !safetyStop &&
            fetchedAt !== null && next.fetchedAt !== null && next.fetchedAt < fetchedAt) return false;
        // Equal revisions may be replayed, but cannot reverse a safety decision.
        if (current && (!current.enabled || !current.consented || contains(BLOCKED, current.status)) &&
            !safetyStop && revision !== null && nextTime === revision) return false;
      }
      if (newGeneration) { revision = null; fetchedAt = null; }
      if (next.generation !== null) generation = next.generation;
      if (next.revision !== null) sequence = next.revision;
      if (nextTime !== null) revision = nextTime;
      if (next.fetchedAt !== null) fetchedAt = next.fetchedAt;
      current = next;
      return true;
    }
    if (initial !== undefined) ingest(initial);
    return Object.freeze({
      ingest: ingest,
      getState: function () { return current; },
      getVisual: function (options) { return derive(current, options); }
    });
  }

  return Object.freeze({ derive: derive, createStore: createStore,
    STALE_MS: STALE_MS, EXPIRE_MS: EXPIRE_MS, CLOCK_SKEW_MS: CLOCK_SKEW_MS });
}));
