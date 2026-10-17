/* Independent body openings. No dependency beyond the bundled Three.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createBodyOpenings = factory;
}(typeof window !== 'undefined' ? window : this, function (THREE, options) {
  'use strict';
  var specs = [
    { id: 'front_left', label: '左前门', axis: 'y', angle: -62 },
    { id: 'front_right', label: '右前门', axis: 'y', angle: 62 },
    { id: 'rear_left', label: '左后门', axis: 'y', angle: -58 },
    { id: 'rear_right', label: '右后门', axis: 'y', angle: 58 },
    { id: 'hood', label: '前舱盖', axis: 'x', angle: -48 },
    { id: 'trunk', label: '后备箱', axis: 'x', angle: 55 }
  ];
  var parts = {}, model = null, reflection = null, disposed = false;
  var raycaster = new THREE.Raycaster(), buttons = [], removers = [];
  var pendingTap = null, pointer = null, activePointers = new Set();
  var now = options.now || function () { return performance.now(); };
  function stateChanged() {
    buttons.forEach(function (button) {
      var part = parts[button.dataset.opening];
      button.disabled = !part || disposed;
      button.setAttribute('aria-pressed', String(!!part && part.target === 1));
      button.textContent = button.dataset.label + (part && part.target ? ' · 开' : ' · 关');
    });
  }
  function update(time) {
    specs.forEach(function (spec) {
      var part = parts[spec.id];
      if (!part) return;
      var t = Math.min(1, Math.max(0, (time - part.start) / part.duration));
      var ease = t * t * (3 - 2 * t);
      part.value = part.from + (part.target - part.from) * ease;
      if (t === 1) part.value = part.target;
      part.node.rotation[part.axis] = part.value * part.angle * Math.PI / 180;
      if (part.mirror) part.mirror.rotation.copy(part.node.rotation);
    });
  }
  function set(id, open) {
    var part = parts[id];
    if (!part || disposed) return false;
    var time = now();
    update(time); // Reversals always start at the currently rendered pose.
    part.from = part.value;
    part.target = open ? 1 : 0;
    part.start = time;
    part.duration = Math.max(180, Math.abs(part.target - part.from) * 850);
    if (options.onActivity) options.onActivity();
    stateChanged();
    return true;
  }
  function toggle(id) { return parts[id] ? set(id, !parts[id].target) : false; }
  function load(object, mirror) {
    model = object; reflection = mirror; parts = {};
    specs.forEach(function (spec) {
      var node = model.getObjectByName('opening_' + spec.id);
      if (!node) return;
      var axis = node.userData.axis;
      if (axis !== 'x' && axis !== 'y' && axis !== 'z') axis = spec.axis;
      var angle = node.userData.angleDegrees;
      if (typeof angle !== 'number' || !isFinite(angle) || Math.abs(angle) > 100) angle = spec.angle;
      parts[spec.id] = { axis: axis, angle: angle, node: node, mirror: reflection && reflection.getObjectByName(node.name), value: 0, from: 0, target: 0, start: 0, duration: 850 };
      node.traverse(function (child) { child.userData.openingId = spec.id; });
    });
    stateChanged();
    return Object.keys(parts).length;
  }
  function hit(x, y) {
    if (!model || disposed) return null;
    var rect = options.canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), options.camera);
    model.updateMatrixWorld(true);
    var meshes = [];
    model.traverse(function (o) {
      if (!o.isMesh) return;
      for (var p = o; p; p = p.parent) if (!p.visible) return;
      meshes.push(o);
    });
    var hits = raycaster.intersectObjects(meshes, false).filter(function (intersection) {
      var material = intersection.object.material;
      if (Array.isArray(material)) material = material[intersection.face ? intersection.face.materialIndex : 0];
      return material && material.visible !== false && !(material.transparent && material.opacity === 0);
    });
    // Only the nearest visible surface is actionable: no opening the far door through the car.
    return hits.length ? { id: hits[0].object.userData.openingId || null, object: hits[0].object } : null;
  }
  function listen(el, name, fn, opts) {
    el.addEventListener(name, fn, opts);
    removers.push(function () { el.removeEventListener(name, fn, opts); });
  }
  function cancelTap() { if (pendingTap) clearTimeout(pendingTap.timer); pendingTap = null; }
  function bind() {
    var canvas = options.canvas;
    listen(canvas, 'pointerdown', function (e) {
      activePointers.add(e.pointerId);
      if (activePointers.size > 1) { pointer = null; cancelTap(); return; }
      if (e.button !== 0) return;
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, time: now(), moved: false };
    });
    listen(canvas, 'pointermove', function (e) {
      if (pointer && pointer.id === e.pointerId && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 7) pointer.moved = true;
    });
    listen(canvas, 'pointercancel', function (e) { activePointers.delete(e.pointerId); pointer = null; cancelTap(); });
    listen(canvas, 'pointerup', function (e) {
      activePointers.delete(e.pointerId);
      var p = pointer; pointer = null;
      if (!p || p.id !== e.pointerId || p.moved || now() - p.time > 650 || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 7) return;
      var target = hit(e.clientX, e.clientY);
      if (!target) { if (pendingTap && pendingTap.action) pendingTap.action(); cancelTap(); return; }
      if (pendingTap && now() - pendingTap.time < 300 && Math.hypot(e.clientX - pendingTap.x, e.clientY - pendingTap.y) < 24) {
        cancelTap();
        if (options.onDoubleTap) options.onDoubleTap();
        return;
      }
      if (pendingTap && pendingTap.action) pendingTap.action();
      cancelTap();
      var action = function () { if (target.id) toggle(target.id); };
      pendingTap = { action: action, time: now(), x: e.clientX, y: e.clientY, timer: setTimeout(function () {
        pendingTap = null;
        action();
      }, 300) };
    });
    // Capture release outside canvas too, so a cancelled drag cannot become a later tap.
    if (typeof window !== 'undefined') listen(window, 'pointerup', function (e) { activePointers.delete(e.pointerId); if (pointer && pointer.id === e.pointerId) pointer = null; });
    if (options.panel) {
      specs.forEach(function (spec) {
        var button = document.createElement('button');
        button.type = 'button'; button.dataset.opening = spec.id; button.dataset.label = spec.label;
        button.setAttribute('aria-label', '开关' + spec.label);
        buttons.push(button); options.panel.appendChild(button);
        listen(button, 'click', function () { toggle(spec.id); });
      });
      stateChanged();
    }
  }
  function dispose() {
    disposed = true; cancelTap(); pointer = null; activePointers.clear();
    removers.forEach(function (remove) { remove(); }); removers = [];
    stateChanged(); parts = {}; model = reflection = null;
  }
  return { load: load, update: update, set: set, toggle: toggle, hit: hit, bind: bind, dispose: dispose,
    getState: function () { var out = {}; Object.keys(parts).forEach(function (id) { out[id] = { value: parts[id].value, open: !!parts[id].target }; }); return out; } };
}));
