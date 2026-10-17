'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('../app/src/main/assets/three.min.js');
const createOpenings = require('../app/src/main/assets/body-openings.js');
const assets = path.join(__dirname, '../app/src/main/assets');

// Use the shipped loader and geometry. Only image decoding is replaced: textures
// have no effect on transforms, bounds, or tire positions in this headless test.
const context = vm.createContext({ window: { THREE }, ArrayBuffer, TextDecoder, console });
context.self = context;
vm.runInContext(fs.readFileSync(path.join(assets, 'GLTFLoader.js'), 'utf8'), context);
const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
const boundsSource = html.match(/function getVisibleBounds\(obj\) \{[\s\S]*?\n      \}/);
const placementSource = html.match(/var preBox = getVisibleBounds\(model\);\s*model\.position\.y = -preBox\.min\.y;/);
assert.ok(boundsSource && placementSource, 'exercise the actual app bounds and placement code');
const getVisibleBounds = vm.runInNewContext('(' + boundsSource[0] + ')', { THREE });

async function load(name) {
  const loader = new context.window.GLTFLoader();
  loader.register(() => ({ name: 'HeadlessTextures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const bytes = fs.readFileSync(path.join(assets, 'model', name));
  const gltf = await new Promise((resolve, reject) => loader.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  return gltf.scene;
}
function place(model) {
  // Match loader callback order, with no render or matrix update before bounds.
  new THREE.Scene().add(model);
  vm.runInNewContext(placementSource[0], { model, getVisibleBounds });
}
function tires(model) {
  model.updateWorldMatrix(true, true);
  const result = [];
  model.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.name !== 'Material #40') return;
    // The GLB combines the four tires in one mesh; split by world X/Z quadrant.
    const wheels = new Map();
    const vertex = new THREE.Vector3();
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      vertex.fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld);
      const name = (vertex.x < 0 ? 'left' : 'right') + (vertex.z < 0 ? '_rear' : '_front');
      const wheel = wheels.get(name) || { name, bottom: Infinity, matrix: mesh.matrixWorld.toArray() };
      wheel.bottom = Math.min(wheel.bottom, vertex.y);
      wheels.set(name, wheel);
    }
    result.push(...wheels.values());
  });
  assert.equal(result.length, 4, 'all four tires are checked');
  return result;
}
function grounded(model) {
  const result = tires(model);
  for (const tire of result) assert.ok(Math.abs(tire.bottom) < 1e-6, `${tire.name} bottom ${tire.bottom} must be at ground y=0`);
  return result;
}

test('initial loader placement grounds all four tires before the first frame, matching legacy v4', async () => {
  const current = await load('XPP7_Model_openings.glb');
  const trunk = current.getObjectByName('opening_trunk');
  assert.equal(trunk.position.y, 2.3);
  assert.equal(trunk.matrixWorld.elements[13], 0, 'fixture reproduces the uninitialized parent transform');
  place(current);
  const currentTires = grounded(current);
  const legacy = await load('XPP7_Model_v4.glb');
  place(legacy);
  const legacyTires = grounded(legacy);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(currentTires[i].bottom - legacyTires[i].bottom) < 1e-6);
});

test('repeated opening, reversal, and closing preserve the grounded root and every wheel transform', async () => {
  const model = await load('XPP7_Model_openings.glb');
  place(model);
  const originalTires = grounded(model), originalPosition = model.position.toArray();
  let time = 0;
  const rig = createOpenings(THREE, { now: () => time });
  assert.equal(rig.load(model), 6);
  const ids = Object.keys(rig.getState());
  function step(dt) {
    time += dt; rig.update(time);
    // Bounds are also read during camera fitting; this must never move the car.
    getVisibleBounds(model);
    assert.deepEqual(model.position.toArray(), originalPosition);
    assert.deepEqual(grounded(model), originalTires);
  }
  for (let cycle = 0; cycle < 2; cycle++) {
    ids.forEach(id => rig.set(id, true)); step(300);
    ids.forEach(id => rig.set(id, false)); step(200);
    ids.forEach(id => rig.set(id, true)); step(1000);
    ids.forEach(id => assert.equal(rig.getState()[id].value, 1));
    ids.forEach(id => rig.set(id, false)); step(1000);
    ids.forEach(id => assert.equal(rig.getState()[id].value, 0));
  }
  rig.dispose();
});

test('default home framing is unchanged by opening doors, selecting default, then closing', async () => {
  const model = await load('XPP7_Model_openings.glb'); place(model);
  let time = 0;
  const rig = createOpenings(THREE, { now: () => time }); rig.load(model);
  const closedHomeBounds = getVisibleBounds(model).clone();
  const homePos = new THREE.Vector3(), homeTarget = new THREE.Vector3();
  const env = vm.createContext({THREE, model, closedHomeBounds, getVisibleBounds, homePos, homeTarget,
    HOME_TARGET_H: 0.92, window: {innerWidth:1188,innerHeight:760}, camera:{fov:45}, lastPortrait:null, homeFrac:0});
  const source = html.match(/function computeHomePose\(\) \{[\s\S]*?\n      \}/)[0];
  vm.runInContext(source + '; computeHomePose();',env);
  const before = [homePos.toArray(),homeTarget.toArray()];
  Object.keys(rig.getState()).forEach(id=>rig.set(id,true)); time+=1000;rig.update(time);
  assert.notDeepEqual(getVisibleBounds(model).max.toArray(),closedHomeBounds.max.toArray());
  vm.runInContext('computeHomePose();',env);
  assert.deepEqual([homePos.toArray(),homeTarget.toArray()],before);
  Object.keys(rig.getState()).forEach(id=>rig.set(id,false)); time+=1000;rig.update(time);
  vm.runInContext('computeHomePose();',env);
  assert.deepEqual([homePos.toArray(),homeTarget.toArray()],before);
});
