'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const THREE = require('../app/src/main/assets/three.min.js');
const createCarPaint = require('../app/src/main/assets/car-paint.js');

function storage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return { data, getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function fixture() {
  const model = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ metalness: 0.6409090757369995, roughness: 0.05909091234207153 });
  paint.name = '材质'; paint.color.setRGB(0.3767459988594055, 0.3767459988594055, 0.3767459988594055);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x888888, transmission: 1 }); glass.name = 'Material #76';
  const light = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff }); light.name = 'light_on';
  const wheel = new THREE.MeshStandardMaterial({ color: 0x555555 }); wheel.name = 'Material #39';
  const trim = new THREE.MeshStandardMaterial({ color: 0x222222 }); trim.name = 'Material #35';
  const geometry = new THREE.BoxGeometry();
  const shell = new THREE.Mesh(geometry, paint); shell.name = 'body'; model.add(shell);
  const opening = new THREE.Group(); opening.name = 'opening_front_left'; model.add(opening);
  const door = new THREE.Mesh(geometry, paint); door.name = 'door'; opening.add(door);
  for (const [name, material] of Object.entries({ glass, light, wheel, trim })) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; model.add(mesh);
  }
  return { model, paint, shell, door, glass, light, wheel, trim };
}
function approx(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`); }

class Element {
  constructor(name, doc) {
    this.tagName = name.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentNode = null;
    this.style = {}; this.attributes = {}; this.listeners = {}; this.value = ''; this.className = '';
    this.classList = { toggle: (name, on) => {
      const names = new Set(this.className.split(' ').filter(Boolean));
      if (on) names.add(name); else names.delete(name); this.className = [...names].join(' ');
    }};
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); }
  removeEventListener(event, fn) { this.listeners[event] = (this.listeners[event] || []).filter(listener => listener !== fn); }
  fire(event) { for (const listener of this.listeners[event] || []) listener({ target: this }); }
  find(predicate) { if (predicate(this)) return this; for (const child of this.children) { const found = child.find(predicate); if (found) return found; } return null; }
  all(predicate) { return (predicate(this) ? [this] : []).concat(...this.children.map(child => child.all(predicate))); }
}
function documentFixture() { const doc = { createElement: name => new Element(name, doc) }; return doc.createElement('div'); }

test('actual GLB has exactly one explicit paint material, separate from every glass/lamp/wheel material', () => {
  const bytes = fs.readFileSync(path.resolve(__dirname, '../app/src/main/assets/model/XPP7_Model_v4.glb'));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const targets = json.materials.map((material, i) => ({ material, i })).filter(entry => entry.material.name === '材质');
  assert.equal(targets.length, 1); assert.equal(targets[0].i, 55);
  assert.equal(json.meshes.filter(mesh => mesh.primitives.some(p => p.material === 55)).length, 1);
  assert.equal(json.meshes.find(mesh => mesh.primitives.some(p => p.material === 55)).name, 'Mesh.054');
  assert.equal(targets[0].material.pbrMetallicRoughness.metallicFactor, 0.6409090757369995);
});

test('default preserves exact original paint; recoloring touches only named paint and preserves finish', () => {
  const f = fixture(); const paint = createCarPaint(THREE, { storage: null });
  const original = f.paint.color.clone(); const snapshots = [f.glass, f.light, f.wheel, f.trim].map(m => m.color.clone());
  const roughness = f.paint.roughness, metalness = f.paint.metalness;
  assert.equal(paint.load(f.model), 1); assert.deepEqual(f.paint.color, original); assert.equal(paint.getColor(), '#a5a5a5');
  assert.equal(paint.setColor('#808080'), true);
  approx(f.paint.color.r, 0.21586050011389926); assert.equal(f.shell.material, f.door.material);
  assert.equal(f.paint.roughness, roughness); assert.equal(f.paint.metalness, metalness);
  [f.glass, f.light, f.wheel, f.trim].forEach((m, i) => assert.deepEqual(m.color, snapshots[i]));
  assert.equal(f.glass.transmission, 1); assert.equal(f.light.emissive.getHex(), 0xffffff);
});

test('color is converted exactly once even if Three color-management setting changes', () => {
  const previous = THREE.ColorManagement.legacyMode;
  try {
    for (const legacy of [true, false]) {
      THREE.ColorManagement.legacyMode = legacy;
      const f = fixture(), paint = createCarPaint(THREE, { storage: null }); paint.load(f.model); paint.setColor('#808080');
      approx(f.paint.color.r, 0.21586050011389926); assert.equal(paint.getColor(), '#808080');
    }
  } finally { THREE.ColorManagement.legacyMode = previous; }
});

test('validates, normalizes, saves and restores colors, including chosen-before-load color', () => {
  const saved = storage(); const paint = createCarPaint(THREE, { storage: saved });
  assert.equal(paint.setColor(' #AbC '), true); assert.equal(saved.getItem(paint.storageKey), '#aabbcc');
  const f = fixture(); paint.load(f.model); assert.equal(paint.getColor(), '#aabbcc');
  const restored = createCarPaint(THREE, { storage: saved }), second = fixture(); restored.load(second.model);
  assert.equal(restored.getColor(), '#aabbcc'); assert.deepEqual(second.paint.color, f.paint.color);
  const current = f.paint.color.clone();
  for (const value of ['red', '#abcdef00', '#12345', '#gggggg', 'javascript:alert(1)', 'rgb(1,2,3)', 123, null, {}]) {
    assert.equal(paint.setColor(value), false); assert.deepEqual(f.paint.color, current);
    assert.equal(saved.getItem(paint.storageKey), '#aabbcc');
  }
});

test('bad stored data and blocked storage never break rendering or live edits', () => {
  for (const data of ['{"color":"#ffffff"}', 'red', '#badhex', '']) {
    const saved = storage({ 'p7show.carPaint.v1': data }); const paint = createCarPaint(THREE, { storage: saved });
    const f = fixture(), original = f.paint.color.clone(); paint.load(f.model);
    assert.deepEqual(f.paint.color, original); assert.equal(paint.getState().custom, false);
  }
  const blocked = { getItem() { throw Error('SecurityError'); }, setItem() { throw Error('QuotaExceededError'); }, removeItem() { throw Error('SecurityError'); } };
  const paint = createCarPaint(THREE, { storage: blocked }), f = fixture();
  assert.doesNotThrow(() => { paint.load(f.model); paint.setColor('#123456'); paint.reset(); });
});

test('restore resets exact source values and survives repeated load without losing original', () => {
  const saved = storage(), paint = createCarPaint(THREE, { storage: saved }), f = fixture();
  const original = f.paint.color.clone(); paint.load(f.model); paint.setColor('#ff0000'); paint.load(f.model);
  assert.equal(paint.reset(), true); assert.deepEqual(f.paint.color, original);
  assert.equal(saved.getItem(paint.storageKey), null); assert.equal(paint.getState().custom, false);
});

test('multi-material arrays color paint slots only and deduplicate shared materials', () => {
  const f = fixture(); const mixed = new THREE.Mesh(new THREE.BoxGeometry(), [f.paint, f.glass]); f.model.add(mixed);
  const paint = createCarPaint(THREE, { storage: null }), glassOriginal = f.glass.color.clone();
  assert.equal(paint.load(f.model), 1); paint.setColor('#ff00ff');
  assert.deepEqual(mixed.userData.p7PaintSlots, [true, false]); assert.deepEqual(f.glass.color, glassOriginal);
});

test('reflected paint follows live colors and scene base without changing other reflected surfaces', () => {
  const f = fixture(), paint = createCarPaint(THREE, { storage: null }); paint.load(f.model);
  const reflection = f.model.clone(), base = new THREE.Color().setRGB(0.1, 0.2, 0.3);
  reflection.traverse(object => { if (object.isMesh) object.material = new THREE.MeshBasicMaterial({ color: base }); });
  paint.syncReflection(reflection, base); paint.setColor('#ff0000');
  const reflected = reflection.getObjectByName('door').material.color;
  approx(reflected.r, 0.1); approx(reflected.g, 0.056); approx(reflected.b, 0.084);
  assert.deepEqual(reflection.getObjectByName('glass').material.color, base);
  assert.deepEqual(reflection.getObjectByName('wheel').material.color, base);
  base.setRGB(0.01, 0.02, 0.03); paint.syncReflection(reflection, base);
  approx(reflected.r, 0.01); approx(reflected.g, 0.0056); approx(reflected.b, 0.0084);
  paint.reset(); assert.deepEqual(reflected, base);
});

test('reflection skips a collapsed mixed-material mesh rather than tinting non-paint surfaces', () => {
  const f = fixture(); const mixed = new THREE.Mesh(new THREE.BoxGeometry(), [f.paint, f.glass]); mixed.name = 'mixed'; f.model.add(mixed);
  const paint = createCarPaint(THREE, { storage: null }); paint.load(f.model); const reflection = f.model.clone();
  const base = new THREE.Color().setRGB(0.1, 0.1, 0.1);
  reflection.traverse(object => { if (object.isMesh) object.material = new THREE.MeshBasicMaterial({ color: base }); });
  paint.syncReflection(reflection, base); paint.setColor('#ff0000');
  assert.deepEqual(reflection.getObjectByName('mixed').material.color, base);
});

test('settings presets, picker, HEX fallback, reset and selected state work live', () => {
  const f = fixture(), container = documentFixture(), saved = storage(); let activity = 0;
  const paint = createCarPaint(THREE, { storage: saved, onActivity() { activity++; } });
  const panel = paint.mountSettings(container);
  const buttons = panel.all(e => e.attributes['data-paint-color']); assert.equal(buttons.length, 6); assert.equal(buttons[0].disabled, true);
  paint.load(f.model); assert.equal(buttons[0].disabled, false); buttons[4].fire('click');
  assert.equal(paint.getColor(), '#245ba0'); assert.equal(buttons[4].getAttribute('aria-pressed'), 'true');
  const picker = panel.find(e => e.type === 'color'); assert.equal(picker.value, '#245ba0');
  picker.value = '#00ff00'; picker.fire('input'); assert.equal(paint.getColor(), '#00ff00'); assert.equal(f.paint.color.g, 1);
  const hex = panel.find(e => e.type === 'text'); hex.value = '#112233'; hex.fire('input'); assert.equal(paint.getColor(), '#112233');
  hex.value = '#zzzzzz'; hex.fire('change'); assert.equal(hex.getAttribute('aria-invalid'), 'true'); assert.equal(paint.getColor(), '#112233');
  hex.value = '#abc'; hex.fire('change'); assert.equal(hex.value, '#aabbcc'); assert.equal(hex.getAttribute('aria-invalid'), 'false');
  const reset = panel.find(e => e.className === 'carPaintReset'); reset.fire('click');
  assert.equal(paint.getState().custom, false); assert.equal(reset.getAttribute('aria-pressed'), 'true'); assert.equal(saved.getItem(paint.storageKey), null);
  assert.ok(activity >= 5);
});

test('repeated mounting and disposal remove old listeners; unknown models safely disable controls', () => {
  const f = fixture(), container = documentFixture(), paint = createCarPaint(THREE, { storage: null }); paint.load(f.model);
  const first = paint.mountSettings(container), oldButton = first.find(e => e.attributes['data-paint-color']);
  paint.mountSettings(container); assert.equal(container.children.length, 1); oldButton.fire('click'); assert.equal(paint.getState().custom, false);
  paint.load(new THREE.Group()); assert.equal(paint.getState().ready, false);
  assert.ok(container.all(e => e.tagName === 'BUTTON').every(e => e.disabled));
  paint.dispose(); assert.equal(container.children.length, 0); assert.equal(paint.setColor('#ff0000'), false);
  assert.equal(paint.load(f.model), 0); assert.equal(paint.reset(), false);
});
