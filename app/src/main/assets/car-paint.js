/* Exterior paint controls for XPP7_Model_v4; compatible with bundled Three.js r148. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createCarPaint = factory;
}(typeof window !== 'undefined' ? window : this, function (THREE, options) {
  'use strict';
  options = options || {};
  // Verified GLB material 55 (original Mesh.054). Never infer paint from brightness,
  // mesh size or metalness: those heuristics would also recolor glass, trim and wheels.
  var PAINT_MATERIAL_NAME = '材质';
  var STORAGE_KEY = 'p7show.carPaint.v1';
  var presets = [
    { label: '珍珠白', color: '#f5f4ee' },
    { label: '星际银', color: '#a5a5a5' },
    { label: '曜石黑', color: '#25282d' },
    { label: '熔岩红', color: '#ad2638' },
    { label: '深海蓝', color: '#245ba0' },
    { label: '松石绿', color: '#26766c' }
  ];
  var records = [], originalColors = new WeakMap(), controls = [], removers = [];
  var reflectionRoot = null, reflectionBase = null, disposed = false, loaded = false, panel = null;
  var storage = null;
  try {
    storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage :
      (typeof window !== 'undefined' ? window.localStorage : null);
  } catch (e) { /* DOM storage can be disabled; live controls must still work. */ }

  function normalizeColor(value) {
    if (typeof value !== 'string') return null;
    var hex = value.trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(hex)) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
  }
  var currentColor = null;
  try { if (storage) currentColor = normalizeColor(storage.getItem(STORAGE_KEY)); } catch (e) { /* optional */ }

  function isPaintMaterial(material) {
    return !!material && material.name === PAINT_MATERIAL_NAME && !!material.color;
  }
  function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function toLinear(hex) {
    var color = new THREE.Color();
    // Assign explicitly so sRGB UI values are converted once, regardless of
    // THREE.ColorManagement.legacyMode (true in this app's bundled r148).
    color.r = srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255);
    color.g = srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255);
    color.b = srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255);
    return color;
  }
  function toHex(color) {
    return '#' + ['r', 'g', 'b'].map(function (channel) {
      var n = Math.round(Math.min(1, Math.max(0, linearToSrgb(color[channel]))) * 255);
      return ('0' + n.toString(16)).slice(-2);
    }).join('');
  }
  function getColor() { return currentColor || (records.length ? toHex(records[0].original) : '#a5a5a5'); }
  function getState() { return { color: getColor(), custom: currentColor !== null, ready: records.length > 0 && !disposed }; }
  function persist() {
    try {
      if (!storage) return;
      if (currentColor === null) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, currentColor);
    } catch (e) { /* Quota/security failure must not prevent paint changes. */ }
  }
  function updateControls() {
    var state = getState();
    controls.forEach(function (control) {
      control.element.disabled = !state.ready;
      if (control.kind === 'preset') {
        var selected = currentColor === control.color;
        control.element.setAttribute('aria-pressed', String(selected));
        control.element.classList.toggle('active', selected);
      } else if (control.kind === 'reset') {
        control.element.setAttribute('aria-pressed', String(!state.custom));
      } else if (control.kind === 'picker' || control.kind === 'hex') {
        control.element.value = state.color;
        if (control.kind === 'hex') control.element.setAttribute('aria-invalid', 'false');
      }
    });
    if (panel) {
      panel.status.textContent = state.ready ? (state.custom ? '当前颜色 ' + state.color.toUpperCase() : '当前颜色：模型原色') : (loaded ? '此模型没有可调整的车漆' : '车漆加载中…');
    }
  }
  function syncReflection(root, baseColor) {
    if (arguments.length) { reflectionRoot = root; reflectionBase = baseColor; }
    if (!reflectionRoot || !reflectionBase || disposed) return;
    var tint = currentColor ? toLinear(currentColor) : null;
    reflectionRoot.traverse(function (object) {
      if (!object.isMesh || !object.userData || !object.userData.p7PaintSlots) return;
      var slots = object.userData.p7PaintSlots;
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      // The current reflection collapses each mesh to one basic material. A mixed
      // paint/non-paint mesh cannot be safely tinted after collapse, so skip it.
      if (slots.length !== materials.length && !slots.every(function (isPaint) { return isPaint; })) return;
      materials.forEach(function (material, i) {
        if (!material || !material.color || !(slots.length === materials.length ? slots[i] : slots[0])) return;
        material.color.copy(reflectionBase);
        if (tint) {
          // Retain the original dark, background-blended reflection. Tint only the
          // painted shell; do not turn it into an emissive, full-brightness duplicate.
          material.color.r *= 0.28 + 0.72 * tint.r;
          material.color.g *= 0.28 + 0.72 * tint.g;
          material.color.b *= 0.28 + 0.72 * tint.b;
        }
      });
    });
  }
  function apply() {
    var linear = currentColor ? toLinear(currentColor) : null;
    records.forEach(function (record) { record.material.color.copy(linear || record.original); });
    syncReflection();
    updateControls();
    if (options.onChange) options.onChange(getColor(), getState());
  }
  function load(model) {
    if (disposed) return 0;
    loaded = true;
    records = [];
    var seen = new Set();
    if (model && model.traverse) model.traverse(function (object) {
      if (!object.isMesh) return;
      var materials = Array.isArray(object.material) ? object.material : [object.material];
      object.userData = object.userData || {};
      // clone() carries these source-material flags into the reflected hierarchy.
      object.userData.p7PaintSlots = materials.map(isPaintMaterial);
      materials.forEach(function (material) {
        if (!isPaintMaterial(material) || seen.has(material)) return;
        seen.add(material);
        if (!originalColors.has(material)) originalColors.set(material, material.color.clone());
        records.push({ material: material, original: originalColors.get(material) });
      });
    });
    apply();
    return records.length;
  }
  function setColor(value) {
    var valid = normalizeColor(value);
    if (!valid || disposed) return false;
    currentColor = valid;
    apply();
    persist();
    if (options.onActivity) options.onActivity();
    return true;
  }
  function reset() {
    if (disposed) return false;
    currentColor = null;
    apply();
    persist();
    if (options.onActivity) options.onActivity();
    return true;
  }
  function listen(element, event, handler) {
    element.addEventListener(event, handler);
    removers.push(function () { element.removeEventListener(event, handler); });
  }
  function protectInput(element) {
    // The drawer listens on window for drag gestures. Native pickers and text
    // selection should retain their own gestures, even when the drawer fits.
    ['mousedown', 'touchstart'].forEach(function (event) {
      listen(element, event, function (e) {
        if (e.stopPropagation) e.stopPropagation();
        if (options.onActivity) options.onActivity();
      });
    });
  }
  function unmountSettings() {
    removers.forEach(function (remove) { remove(); });
    removers = []; controls = [];
    if (panel && panel.element.parentNode) panel.element.parentNode.removeChild(panel.element);
    panel = null;
  }
  function mountSettings(container) {
    if (!container || disposed) return null;
    unmountSettings();
    var doc = container.ownerDocument;
    var section = doc.createElement('section');
    section.className = 'carPaintSettings';
    section.setAttribute('aria-label', '车身颜色');
    var heading = doc.createElement('div');
    heading.className = 'carPaintTitle'; heading.textContent = '车身颜色'; section.appendChild(heading);
    var grid = doc.createElement('div'); grid.className = 'carPaintPresets'; section.appendChild(grid);
    presets.forEach(function (preset) {
      var button = doc.createElement('button');
      button.type = 'button'; button.className = 'carPaintPreset';
      button.setAttribute('aria-label', preset.label + ' ' + preset.color);
      button.setAttribute('data-paint-color', preset.color);
      var swatch = doc.createElement('span'); swatch.className = 'carPaintSwatch';
      swatch.style.backgroundColor = preset.color; swatch.setAttribute('aria-hidden', 'true');
      button.appendChild(swatch);
      var label = doc.createElement('span'); label.textContent = preset.label; button.appendChild(label);
      grid.appendChild(button);
      controls.push({ kind: 'preset', color: preset.color, element: button });
      listen(button, 'click', function () { setColor(preset.color); });
    });
    var custom = doc.createElement('label'); custom.className = 'carPaintCustom'; section.appendChild(custom);
    var customLabel = doc.createElement('span'); customLabel.textContent = '自定义颜色'; custom.appendChild(customLabel);
    var picker = doc.createElement('input'); picker.type = 'color'; picker.className = 'carPaintPicker';
    picker.setAttribute('aria-label', '选择任意车身颜色'); custom.appendChild(picker);
    controls.push({ kind: 'picker', element: picker });
    protectInput(picker);
    listen(picker, 'input', function () { setColor(picker.value); });
    listen(picker, 'change', function () { setColor(picker.value); });
    var exactLabel = doc.createElement('label'); exactLabel.className = 'carPaintCustom'; section.appendChild(exactLabel);
    var hexLabel = doc.createElement('span'); hexLabel.textContent = 'HEX 色值'; exactLabel.appendChild(hexLabel);
    var hex = doc.createElement('input'); hex.type = 'text'; hex.className = 'carPaintHex'; hex.maxLength = 7;
    hex.spellcheck = false; hex.autocomplete = 'off'; hex.setAttribute('aria-label', '十六进制颜色，例如 #245ba0');
    hex.setAttribute('autocapitalize', 'none'); exactLabel.appendChild(hex);
    controls.push({ kind: 'hex', element: hex });
    protectInput(hex);
    listen(hex, 'input', function () {
      // Keep partial input editable; complete six-digit values preview immediately.
      if (/^#[0-9a-f]{6}$/i.test(hex.value)) setColor(hex.value);
    });
    listen(hex, 'change', function () {
      if (!setColor(hex.value)) {
        hex.setAttribute('aria-invalid', 'true');
        panel.status.textContent = '请输入 #RRGGBB 格式，例如 #245ba0';
      }
    });
    var resetButton = doc.createElement('button'); resetButton.type = 'button';
    resetButton.className = 'carPaintReset'; resetButton.textContent = '恢复模型原色'; section.appendChild(resetButton);
    controls.push({ kind: 'reset', element: resetButton }); listen(resetButton, 'click', reset);
    var status = doc.createElement('div'); status.className = 'carPaintStatus'; status.setAttribute('aria-live', 'polite');
    section.appendChild(status);
    panel = { element: section, status: status }; container.appendChild(section); updateControls();
    return section;
  }
  function dispose() {
    unmountSettings(); records = []; reflectionRoot = null; reflectionBase = null; disposed = true;
  }
  return {
    load: load, setColor: setColor, reset: reset, getColor: getColor, getState: getState,
    normalizeColor: normalizeColor, isPaintMaterial: isPaintMaterial,
    mountSettings: mountSettings, syncReflection: syncReflection, dispose: dispose,
    presets: presets.slice(), storageKey: STORAGE_KEY
  };
}));
