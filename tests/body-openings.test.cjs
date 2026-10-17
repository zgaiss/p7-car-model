const test = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('../app/src/main/assets/three.min.js');
const create = require('../app/src/main/assets/body-openings.js');
const ids = ['front_left', 'front_right', 'rear_left', 'rear_right', 'hood', 'trunk'];
function fixture() {
  let time = 0;
  const model = new THREE.Group();
  ids.forEach(id => { const node = new THREE.Group(); node.name = 'opening_' + id; model.add(node); });
  const mirror = model.clone();
  const rig = create(THREE, {now: () => time});
  assert.equal(rig.load(model, mirror), 6);
  return { rig, model, mirror, at: value => { time = value; rig.update(time); } };
}
test('six independent panels reach exact end poses and close exactly', () => {
  const f = fixture();
  for (const id of ids) {
    f.rig.set(id, true);
    f.at(10000 + ids.indexOf(id) * 10000);
    assert.equal(f.rig.getState()[id].value, 1);
  }
  assert.equal(f.model.getObjectByName('opening_hood').rotation.x < 0, true);
  assert.equal(f.model.getObjectByName('opening_trunk').rotation.x > 0, true);
  ids.forEach(id => f.rig.set(id, false)); f.at(100000);
  ids.forEach(id => assert.equal(f.rig.getState()[id].value, 0));
});
test('mid-animation reversal has no position jump; other doors stay closed', () => {
  const f = fixture(); f.rig.toggle('front_left'); f.at(320);
  const before = f.rig.getState().front_left.value;
  assert.ok(before > 0 && before < 1);
  f.rig.toggle('front_left');
  assert.equal(f.rig.getState().front_left.value, before);
  f.at(400); assert.ok(f.rig.getState().front_left.value < before);
  ids.slice(1).forEach(id => assert.equal(f.rig.getState()[id].value, 0));
  f.at(1000); assert.equal(f.rig.getState().front_left.value, 0);
});
test('reflection uses identical hinge transforms at every sampled frame', () => {
  const f = fixture(); ids.forEach(id => f.rig.toggle(id));
  for (let time = 0; time <= 1000; time += 16) {
    f.at(time);
    ids.forEach(id => assert.deepEqual(f.model.getObjectByName('opening_' + id).rotation.toArray(), f.mirror.getObjectByName('opening_' + id).rotation.toArray()));
  }
});
test('unknown or disposed panels are safe; missing geometry does not enable panels', () => {
  const f = fixture(); assert.equal(f.rig.toggle('missing'), false); f.rig.dispose();
  assert.equal(f.rig.toggle('hood'), false); f.at(5000); assert.deepEqual(f.rig.getState(), {});
  assert.equal(create(THREE, {}).load(new THREE.Group()), 0);
});
function eventCanvas() {
  const handlers = {};
  return { getBoundingClientRect: () => ({left:0,top:0,width:100,height:100}), addEventListener: (name, fn) => {handlers[name] = fn;}, removeEventListener: name => {delete handlers[name];}, emit: (name, values = {}) => handlers[name]?.({pointerId:1,button:0,clientX:50,clientY:50,...values}), handlers };
}
function interactiveFixture() {
  let time = 1000, doubles = 0;
  const canvas = eventCanvas(), model = new THREE.Group(), camera = new THREE.PerspectiveCamera(50,1,.1,100);
  camera.position.z = 5; camera.updateMatrixWorld();
  const node = new THREE.Group(); node.name='opening_hood';
  node.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,1), new THREE.MeshBasicMaterial())); model.add(node);
  const rig = create(THREE, {canvas,camera,now:()=>time,onDoubleTap:()=>doubles++}); rig.load(model); rig.bind();
  return {canvas,rig,setTime: t=>time=t,getDoubles:()=>doubles};
}
test('drag, long press, and two-pointer pinch do not trigger opening', async () => {
  const f=interactiveFixture();
  f.canvas.emit('pointerdown'); f.canvas.emit('pointermove',{clientX:70}); f.canvas.emit('pointerup');
  f.canvas.emit('pointerdown'); f.setTime(2000); f.canvas.emit('pointerup');
  f.canvas.emit('pointerdown'); f.canvas.emit('pointerdown',{pointerId:2}); f.canvas.emit('pointerup',{pointerId:2}); f.canvas.emit('pointerup');
  await new Promise(r=>setTimeout(r,330)); assert.equal(f.rig.getState().hood.open,false); f.rig.dispose();
});
test('single click toggles the nearest panel, double click only toggles lights', async () => {
  const f=interactiveFixture();
  f.canvas.emit('pointerdown'); f.canvas.emit('pointerup');
  await new Promise(r=>setTimeout(r,330)); assert.equal(f.rig.getState().hood.open,true);
  f.setTime(2000); f.canvas.emit('pointerdown'); f.canvas.emit('pointerup');
  f.setTime(2100); f.canvas.emit('pointerdown'); f.canvas.emit('pointerup');
  await new Promise(r=>setTimeout(r,330)); assert.equal(f.rig.getState().hood.open,true); assert.equal(f.getDoubles(),1); f.rig.dispose();
});
test('dispose cancels a pending tap and removes listeners', async () => {
  const f=interactiveFixture(); f.canvas.emit('pointerdown'); f.canvas.emit('pointerup'); f.rig.dispose();
  await new Promise(r=>setTimeout(r,330)); assert.deepEqual(f.rig.getState(),{}); assert.deepEqual(f.canvas.handlers,{});
});
test('background second tap does not swallow an already valid panel tap', () => {
  const f=interactiveFixture(); f.canvas.emit('pointerdown'); f.canvas.emit('pointerup'); f.setTime(1100);
  f.canvas.emit('pointerdown',{clientX:0,clientY:0}); f.canvas.emit('pointerup',{clientX:0,clientY:0});
  assert.equal(f.rig.getState().hood.open,true); f.rig.dispose();
});
test('material-hidden surfaces cannot occlude a visible panel', () => {
  const canvas=eventCanvas(), camera=new THREE.PerspectiveCamera(50,1,.1,100), model=new THREE.Group();
  camera.position.z=5; camera.updateMatrixWorld();
  const node=new THREE.Group(); node.name='opening_hood';
  node.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,1),new THREE.MeshBasicMaterial())); model.add(node);
  const invisible=new THREE.Mesh(new THREE.BoxGeometry(2,2,1),new THREE.MeshBasicMaterial({visible:false})); invisible.position.z=2; model.add(invisible);
  const rig=create(THREE,{canvas,camera}); rig.load(model); assert.equal(rig.hit(50,50).id,'hood');
  invisible.material.visible=true; assert.equal(rig.hit(50,50).id,null); rig.dispose();
});
