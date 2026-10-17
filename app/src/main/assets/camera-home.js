/* Camera preference state, independent of the renderer and safe on restricted WebViews. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.P7CameraHome = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var KEY = 'p7show.cameraHome.v1';
  function vector(v) {
    return Array.isArray(v) && v.length === 3 && v.every(function (n) {
      return typeof n === 'number' && isFinite(n) && Math.abs(n) <= 1000000;
    });
  }
  function pose(p) {
    return p && vector(p.position) && vector(p.target) && p.position.some(function (n, i) {
      return Math.abs(n - p.target[i]) > 0.000001;
    });
  }
  function create(storage) {
    var state = { version: 1, mode: 'default', pose: null };
    try {
      var saved = JSON.parse(storage.getItem(KEY));
      if (saved && saved.version === 1 && (saved.mode === 'default' || saved.mode === 'custom') && pose(saved.pose)) {
        state = { version: 1, mode: saved.mode, pose: saved.pose };
      }
    } catch (_) {} // No storage, invalid JSON, and blocked storage all keep safe defaults.
    function snapshot() { return JSON.parse(JSON.stringify(state)); }
    function persist() {
      try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (_) { return false; }
    }
    return {
      snapshot: snapshot,
      save: function (position, target) {
        var next = { position: position, target: target };
        if (!pose(next)) return { ok: false, persisted: false };
        state.pose = JSON.parse(JSON.stringify(next));
        state.mode = 'custom';
        return { ok: true, persisted: persist() };
      },
      select: function (mode) {
        if (mode !== 'default' && mode !== 'custom' || mode === 'custom' && !state.pose) return false;
        state.mode = mode;
        persist();
        return true;
      }
    };
  }
  // Equal elapsed time produces equal convergence at 15, 30, 60, or 120 fps.
  function alpha(seconds) { return 1 - Math.exp(-3.72 * Math.max(0, seconds)); }
  function shouldReturn(idleMs, drawerBusy, interacting, tweening, ready) {
    return !!ready && !drawerBusy && !interacting && !tweening && idleMs >= 5000;
  }
  function pointers() {
    var held = new Set();
    return {
      start: function (id) { held.add(id); },
      end: function (id) { held.delete(id); },
      clear: function () { held.clear(); },
      active: function () { return held.size > 0; }
    };
  }
  return { pointers: pointers, create: create, alpha: alpha, shouldReturn: shouldReturn, storageKey: KEY };
}));
