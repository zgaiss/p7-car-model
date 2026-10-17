const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Home = require('../app/src/main/assets/camera-home.js');
function storage(value) { return { value, getItem() { return this.value; }, setItem(k, v) { this.value = v; } }; }
const position = [4, 2, 4], target = [0, 1, 0];
test('fresh install stays default and cannot enable an unsaved custom pose', () => {
  const h = Home.create(storage(null));
  assert.deepEqual(h.snapshot(), { version: 1, mode: 'default', pose: null });
  assert.equal(h.select('custom'), false);
});
test('explicit save enables and persists exact position and target; reload restores it', () => {
  const s = storage(null), h = Home.create(s);
  assert.deepEqual(h.save(position, target), { ok: true, persisted: true });
  assert.deepEqual(Home.create(s).snapshot(), h.snapshot());
  assert.equal(h.snapshot().mode, 'custom');
});
test('mode selection is idempotent and never captures a new camera position', () => {
  const s = storage(null), h = Home.create(s);
  h.save(position, target);
  h.select('custom'); h.select('custom');
  assert.deepEqual(h.snapshot().pose, {position, target});
  h.select('default');
  const restored = Home.create(s);
  assert.equal(restored.snapshot().mode, 'default');
  restored.select('custom');
  assert.deepEqual(restored.snapshot().pose, {position, target});
});
test('only explicit resave replaces the view; arrays and snapshots are isolated', () => {
  const h = Home.create(storage(null));
  const p = position.slice(); h.save(p, target); p[0] = 123;
  h.snapshot().pose.position[0] = 456;
  assert.equal(h.snapshot().pose.position[0], 4);
  h.save([1, 3, 8], [0, 0, 1]);
  assert.deepEqual(h.snapshot().pose.position, [1, 3, 8]);
});
test('malformed, nonfinite, huge, coincident, unknown-version data safely falls back', () => {
  for (const value of ['bad', 'null', '{}', JSON.stringify({version: 2, mode:'custom',pose:{position,target}}),
    ...[[NaN,2,3],[1e9,2,3],[0,1,0],['4',2,4]].map(p => JSON.stringify({version:1,mode:'custom',pose:{position:p,target}}))]) {
    assert.equal(Home.create(storage(value)).snapshot().mode, 'default');
  }
  const h = Home.create(storage(null));
  for (const p of [[Infinity,2,3],target,[1,2],['4',2,4]]) assert.equal(h.save(p,target).ok,false);
});
test('unavailable or quota-limited storage keeps session working and reports no persistence', () => {
  for (const s of [null, {getItem(){throw Error('denied')},setItem(){throw Error('quota')}}]) {
    const h = Home.create(s);
    assert.deepEqual(h.save(position,target),{ok:true,persisted:false});
    assert.equal(h.snapshot().mode,'custom');
  }
});
test('return is elapsed-time based across frame rates and handles stalls', () => {
  function run(fps) { let x=10; for(let n=0;n<fps*2;n++) x += (0-x)*Home.alpha(1/fps); return x; }
  for(const fps of [1,15,30,60,120]) assert.ok(Math.abs(run(fps)-run(60))<1e-12);
  assert.equal(Home.alpha(-1),0);
  assert.ok(Home.alpha(3)>0.9999);
});
test('idle return is blocked during settings, a held gesture, a tween, or loading', () => {
  assert.equal(Home.shouldReturn(4999,false,false,false,true),false);
  assert.equal(Home.shouldReturn(5000,false,false,false,true),true);
  for(const args of [[true,false,false,true],[false,true,false,true],[false,false,true,true],[false,false,false,false]])
    assert.equal(Home.shouldReturn(10000,...args),false);
});
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/index.html'),'utf8');
test('all inline JavaScript parses and shipped HTML loads camera state before main code', () => {
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  assert.ok(html.indexOf('src="camera-home.js"') < html.indexOf('P7CameraHome.create'));
});
test('integration wires explicit saving, restored boot pose, stable closed bounds and gesture interruption', () => {
  assert.match(html,/cameraHome\.save\(camera\.position\.toArray\(\), controls\.target\.toArray\(\)\)/);
  assert.match(html,/camera\.position\.copy\(useCustomHome \? customHomePos : homePos\)/);
  assert.match(html,/closedHomeBounds = getVisibleBounds\(model\)\.clone\(\)/);
  assert.match(html,/var box = closedHomeBounds \|\| getVisibleBounds\(model\)/);
  assert.match(html,/pointerdown', function \(e\) \{ cameraPointers.start\(e.pointerId\); cancelTween\(\); cameraInteracting = true/);
  assert.match(html,/function setDrawerOpen\(open\) \{ cancelTween\(\); resetTimer\(\)/);
  assert.doesNotMatch(html,/controls\.enabled = false/);
  assert.doesNotMatch(html,/\.lerp\(h[PT], 0\.06\)/);
});

test('two-pointer interaction remains active until both release; unknown release and blur are safe', () => {
  const held=Home.pointers(); held.start(10); held.start(20); held.end(10);
  assert.equal(held.active(),true);
  assert.equal(Home.shouldReturn(10000,false,held.active(),false,true),false);
  held.end(99); assert.equal(held.active(),true);
  held.end(20); assert.equal(held.active(),false);
  held.start(30); held.clear(); assert.equal(held.active(),false);
});
