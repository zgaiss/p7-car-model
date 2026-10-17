/* Native audio input and local preferences only; the scene owns its render loop. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.P7SpectrumState = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BIN_COUNT = 64;
  var FRAME_FRESH_MS = 500;
  var MEDIA_FRESH_MS = 2500;
  var ATTACK_MS = 50;
  var RELEASE_MS = 180;
  var ZERO_EPSILON = 0.0005;
  var SETTINGS_KEY = 'p7.spectrum.v1';
  var STYLES = Object.freeze(['bands', 'ribbon', 'terrain', 'led']);

  function finiteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function validFrame(frame) {
    return !!frame && (Array.isArray(frame) ||
      (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(frame))) &&
      frame.length === BIN_COUNT;
  }

  function State() {
    this.values = new Float32Array(BIN_COUNT);
    this._target = new Float32Array(BIN_COUNT);
    this.reset();
  }

  State.prototype.reset = function () {
    // Keep the public buffer stable for consumers, but invalidate all observations.
    this.values.fill(0);
    this._target.fill(0);
    this.energy = 0;
    this.active = false;
    this._lastNow = null;
    this._frame = null;
    this._frameAt = -Infinity;
    this._frameValid = false;
    this._hasSignal = false;
    this._media = null;
    this._mediaAt = -Infinity;
    return this;
  };

  State.prototype.update = function (now, frame, media, enabled) {
    if (enabled === false) return this.reset();

    // Use one caller-owned clock. Native lyric timestamps use another clock and
    // must not be compared with performance.now(). A bad clock cannot poison bins.
    if (!finiteNumber(now)) now = this._lastNow === null ? 0 : this._lastNow;
    now = Math.max(0, this._lastNow === null ? now : Math.max(this._lastNow, now));
    var dt = this._lastNow === null ? 0 : now - this._lastNow;
    this._lastNow = now;

    // Android replaces the 64-bin array every 160 ms. Merely rendering the same
    // object again does not refresh it; an unchanged last frame expires naturally.
    if (frame !== this._frame) {
      this._frame = frame;
      this._frameAt = now;
      this._frameValid = validFrame(frame);
      this._hasSignal = false;
      for (var i = 0; i < BIN_COUNT; i++) {
        var raw = this._frameValid ? frame[i] : 0;
        var value = finiteNumber(raw) ? Math.max(0, Math.min(1, raw)) : 0;
        this._target[i] = value;
        if (value > 0) this._hasSignal = true;
      }
    }

    // A missing media bridge is allowed (microphone-only installations). Once a
    // media object is present, only an explicit, fresh playing status permits it.
    var mediaMissing = media === undefined || media === null;
    if (media !== this._media) {
      this._media = media;
      this._mediaAt = now;
    }
    var playing = mediaMissing || (typeof media === 'object' &&
      !Array.isArray(media) && media.status === 0 && now - this._mediaAt <= MEDIA_FRESH_MS);
    this.active = !!(this._frameValid && this._hasSignal &&
      now - this._frameAt <= FRAME_FRESH_MS && playing);

    // Exponential attack/release depends on elapsed milliseconds, not refresh
    // count. Do not cap dt: a suspended or low-FPS view must still decay fully.
    var attack = 1 - Math.exp(-dt / ATTACK_MS);
    var release = 1 - Math.exp(-dt / RELEASE_MS);
    var total = 0;
    for (var j = 0; j < BIN_COUNT; j++) {
      var target = this.active ? this._target[j] : 0;
      var previous = this.values[j];
      var next = previous + (target - previous) * (target > previous ? attack : release);
      // A release must reach exact silence, rather than an endless nonzero tail.
      if (target === 0 && next < ZERO_EPSILON) next = 0;
      this.values[j] = next;
      total += this.values[j];
    }
    // active describes the input; energy includes its short, real decay tail.
    this.energy = total / BIN_COUNT;
    return this;
  };

  function normalizeSettings(settings) {
    var object = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
    return {
      enabled: typeof object.enabled === 'boolean' ? object.enabled : true,
      style: STYLES.indexOf(object.style) !== -1 ? object.style : 'bands'
    };
  }

  function readSettings(storage) {
    try {
      return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
    } catch (error) {
      // Storage can be absent, disabled, full, or blocked by WebView policy.
      return normalizeSettings(null);
    }
  }

  function writeSettings(storage, settings) {
    try {
      storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
      return true;
    } catch (error) {
      return false;
    }
  }

  return { State: State, readSettings: readSettings, writeSettings: writeSettings, styles: STYLES };
}));
