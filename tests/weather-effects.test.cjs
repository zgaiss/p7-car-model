const test=require('node:test'),assert=require('node:assert/strict');
const THREE=require('../app/src/main/assets/three.min.js');const factory=require('../app/src/main/assets/weather-effects.js'); const vm=require('vm'),fs=require('fs');const sandbox={THREE,console,performance,crypto:require('node:crypto').webcrypto};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../app/src/main/assets/vendor/nebula/three-nebula.umd.js'),'utf8'),sandbox);const create=()=>factory(THREE,{Nebula:sandbox.Nebula});
test('bounded buffers and shared scheduler only',()=>{const w=create(THREE);assert.deepEqual(w.getState().counts,{rain:160,snow:80,stars:100});assert.deepEqual(w.getState().particleCounts,[160,80,100]);assert.equal(w.group.children.length,3);w.group.children.forEach(p=>{assert.equal(p.material.depthWrite,false);assert.equal(p.material.depthTest,true);assert.equal(p.visible,false);});w.dispose();});
test('caps low frame delta and negative or invalid input',()=>{const w=create(THREE);w.update(20,[],1200,630,3);assert.equal(w.getState().time,.05);w.update(-1);w.update(NaN);assert.equal(w.getState().time,.05);w.dispose();});
test('crossfade exits old layer and unknown clears',()=>{const w=create(THREE);w.setKind('rain');for(let i=0;i<100;i++)w.update(.05,[],1200,630,1);assert.deepEqual(w.getState().visible,['rain']);w.setKind('snow');w.update(.05,[],1200,630,1);assert.deepEqual(w.getState().visible,['rain','snow']);for(let i=0;i<100;i++)w.update(.05,[],1200,630,1);assert.deepEqual(w.getState().visible,['snow']);w.setKind('bad');for(let i=0;i<100;i++)w.update(.05,[],1200,630,1);assert.deepEqual(w.getState().visible,[]);w.dispose();});
test('resize masks and DPR cap; idempotent resource disposal',()=>{const w=create(THREE),s=new THREE.Scene();s.add(w.group);w.update(.01,[{left:0,top:0,right:600,bottom:315}],1200,630,4);const u=w.group.children[0].material.uniforms;assert.deepEqual(u.uMasks.value[0].toArray(),[-1,0,0,1]);assert.equal(u.uDpr.value,2);let n=0;w.group.children.forEach(p=>{p.geometry.addEventListener('dispose',()=>n++);p.material.addEventListener('dispose',()=>n++);});w.dispose();w.dispose();w.update(1);w.setKind('snow');assert.equal(n,6);assert.equal(s.children.length,0);});
test('no network, location or autonomous animation in effect',()=>{const s=require('fs').readFileSync(require.resolve('../app/src/main/assets/weather-effects.js'),'utf8');assert.ok(!/requestAnimationFrame|setInterval|setTimeout|fetch\(|XMLHttpRequest|geolocation/.test(s));});
test('rain keeps fine varied streaks while snow and stars use smaller depth-aware points',()=>{const w=create();w.setKind('rain');w.update(.05,[],1200,630,1);const rain=w.group.children[0];assert.match(rain.material.vertexShader,/10\.0\+aSeed\*12\.0/);assert.match(rain.material.vertexShader,/1\.8\+aSeed\*aSeed\*4\.2.*1\.3\+aSeed\*aSeed\*2\.3/);assert.ok(rain.material.uniforms.uAlpha.value<.4);w.dispose();});

test('snow depth produces bounded varied fall speeds and gentle lateral drift',()=>{
  const w=create();w.setKind('snow');w.update(.01,[],1200,630,1);
  const snow=w.group.children[1],a=Array.from(snow.geometry.attributes.position.array);
  w.update(.05,[],1200,630,1);const b=snow.geometry.attributes.position.array,speeds=[];
  for(let i=0;i<80;i++){const dy=b[i*3+1]-a[i*3+1];if(dy<0)speeds.push(-dy/.05);assert.ok(Math.abs(b[i*3]-a[i*3])<.002);}
  assert.ok(speeds.length>70);assert.ok(Math.max(...speeds)>Math.min(...speeds)*2);
  assert.ok(Math.max(...speeds)<.13);assert.ok(Math.min(...speeds)>.03);
  for(let i=0;i<1600;i++)w.update(.05,[],1200,630,1);
  for(let i=0;i<80;i++){assert.ok(Math.abs(b[i*3])<=1.04);assert.ok(b[i*3+1]>=-.45&&b[i*3+1]<=1);}
  assert.deepEqual(w.getState().particleCounts,[160,80,100]);w.dispose();
});
test('stars stay fixed in the upper sky and have restrained independent twinkle',()=>{
  const w=create();w.setKind('stars');w.update(.05,[],1200,630,1);
  const stars=w.group.children[2],initial=Array.from(stars.geometry.attributes.position.array);
  for(let i=0;i<100;i++){assert.ok(initial[i*3+1]>=.3&&initial[i*3+1]<=.97);assert.ok(Math.abs(initial[i*3])<1);}
  for(let i=0;i<600;i++)w.update(.05,[],1200,630,1);
  assert.deepEqual(Array.from(stars.geometry.attributes.position.array),initial);
  assert.match(stars.material.fragmentShader,/0.92\+0.08\*sin/);
  assert.match(stars.material.fragmentShader,/smoothstep\(0.28,0.48,vScreen.y\)/);
  assert.match(stars.material.fragmentShader,/vSeed\*vSeed\*vSeed\*0.72/);w.dispose();
});
test('repeated snow and star switching reuses the same Nebula systems and buffers',()=>{
  const w=create(),points=w.group.children.slice(),buffers=points.map(p=>p.geometry.attributes.position.array);
  for(let i=0;i<200;i++){w.setKind(i%2?'snow':'stars');w.update(.05,[],1200,630,2);}
  assert.deepEqual(w.getState().particleCounts,[160,80,100]);
  w.group.children.forEach((p,i)=>{assert.equal(p,points[i]);assert.equal(p.geometry.attributes.position.array,buffers[i]);});w.dispose();
});
test('wind concept is opt-in and keeps fixed particle budgets',()=>{const normal=create(),w=factory(THREE,{Nebula:sandbox.Nebula,wind:true});assert.equal(normal.group.children[0].material.uniforms.uWind.value,0);assert.equal(w.group.children[0].material.uniforms.uWind.value,1);w.setKind('snow');for(let i=0;i<300;i++)w.update(.05,[],1200,600,1);assert.deepEqual(w.getState().particleCounts,[160,80,100]);const pos=w.group.children[1].geometry.attributes.position.array;for(let i=0;i<pos.length;i++)assert.ok(Number.isFinite(pos[i]));normal.dispose();w.dispose();});

test('wind uniform uses matching explicit precision across shader stages',()=>{
 const src=fs.readFileSync(__dirname+'/../app/src/main/assets/weather-effects.js','utf8');
 assert.equal((src.match(/uniform highp float uWind;/g)||[]).length,2);
});

test('live wind strength continuously scales snow drift and layer opacity',()=>{const a=create(),b=create();a.setWind(.01);b.setWind(1);a.setKind('snow');b.setKind('snow');for(let i=0;i<40;i++){a.update(.05,[],1200,630,1);b.update(.05,[],1200,630,1);}assert.notEqual(a.group.children[1].geometry.attributes.position.array[0],b.group.children[1].geometry.attributes.position.array[0]);assert.ok(a.group.children[1].material.uniforms.uAlpha.value<b.group.children[1].material.uniforms.uAlpha.value);a.dispose();b.dispose();});
