'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const THREE=require('../app/src/main/assets/three.min.js');
const createReflection=require('../app/src/main/assets/car-reflection.js');
const createPaint=require('../app/src/main/assets/car-paint.js');
const createOpenings=require('../app/src/main/assets/body-openings.js');
const assets=path.join(__dirname,'../app/src/main/assets');
const loaderContext=vm.createContext({window:{THREE},ArrayBuffer,TextDecoder,console});loaderContext.self=loaderContext;
vm.runInContext(fs.readFileSync(path.join(assets,'GLTFLoader.js'),'utf8'),loaderContext);
async function loadModel(){
  const loader=new loaderContext.window.GLTFLoader();loader.register(()=>({name:'HeadlessTextures',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const bytes=fs.readFileSync(path.join(assets,'model/XPP7_Model_openings.glb'));
  const gltf=await new Promise((resolve,reject)=>loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
  return gltf.scene;
}
function rendererFixture(){
  let target=null,clearColor=new THREE.Color(0x123456),clearAlpha=.4;
  const calls=[];
  return {calls,autoClear:true,toneMapping:THREE.ACESFilmicToneMapping,outputEncoding:THREE.sRGBEncoding,
    xr:{enabled:false},shadowMap:{autoUpdate:true},domElement:{width:960,height:600},
    getSize:v=>v.set(960,600),getDrawingBufferSize:v=>v.set(960,600),getPixelRatio:()=>1,
    getRenderTarget:()=>target,setRenderTarget:t=>{target=t;calls.push(['target',t]);},
    getClearColor:color=>color.copy(clearColor),getClearAlpha:()=>clearAlpha,
    setClearColor:(color,alpha)=>{clearColor.set(color);if(alpha!==undefined)clearAlpha=alpha;},
    setClearAlpha:alpha=>{clearAlpha=alpha;},
    clear:(...args)=>calls.push(['clear',...args]),
    render:(scene,camera)=>{scene.updateMatrixWorld(true);if(camera.parent===null)camera.updateMatrixWorld(true);calls.push(['render',scene,camera,target]);},
    getViewport:v=>v.set(0,0,960,600),setViewport(){},getScissor:v=>v.set(0,0,960,600),setScissor(){},getScissorTest:()=>false,setScissorTest(){}
  };
}
function fixture(){
  const model=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color:0x808080}),glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.4});paint.name='材质';glass.name='glass';
  for(const [name,material] of [['body',paint],['window',glass]]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);mesh.name=name;model.add(mesh);}
  const parent=new THREE.Group();parent.name='opening_front_left';model.add(parent);const door=new THREE.Mesh(new THREE.BoxGeometry(),paint);door.name='door';parent.add(door);
  return {model,paint,glass};
}
function draw(reflection,renderer=rendererFixture()){
  const camera=new THREE.PerspectiveCamera(45,1.6,.1,100);camera.position.set(5,4,8);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);reflection.render(renderer,camera);return renderer;
}
function assertMirroredVertices(model,root,planeY){
  model.updateWorldMatrix(true,true);root.updateWorldMatrix(true,true);
  const a=new THREE.Vector3(),b=new THREE.Vector3();let count=0;
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;const reflected=root.getObjectByName(mesh.name);assert.ok(reflected,mesh.name);
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      a.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(positions,i).applyMatrix4(reflected.matrixWorld);
      if(Math.abs(a.x-b.x)>1e-5||Math.abs(a.z-b.z)>1e-5||Math.abs(a.y+b.y-2*planeY)>1e-5)
        assert.fail(`${mesh.name} vertex ${i} is not an exact reflection across y=${planeY}`);
      count++;
    }
  });assert.ok(count>0);return count;
}
test('actual GLB every vertex mirrors across water plane through closed, partial and six-open poses',async()=>{
  const model=await loadModel(),planeY=-.01,reflection=createReflection(THREE,{planeY,baseColor:new THREE.Color(.1,.2,.3)});
  model.position.set(.15,.37,-.2);const root=reflection.load(model);let time=0;
  const rig=createOpenings(THREE,{now:()=>time});assert.equal(rig.load(model,root),6);const ids=Object.keys(rig.getState());
  draw(reflection);const vertexCount=assertMirroredVertices(model,root,planeY);assert.ok(vertexCount>100000);
  ids.forEach(id=>rig.set(id,true));
  for(const frame of [250,850,1200]){time=frame;rig.update(time);draw(reflection);assert.equal(assertMirroredVertices(model,root,planeY),vertexCount);}
  ids.forEach(id=>assert.equal(rig.getState()[id].value,1));
  ids.forEach(id=>rig.set(id,false));time=2200;rig.update(time);draw(reflection);assertMirroredVertices(model,root,planeY);
  rig.dispose();reflection.dispose();
});
test('root reflection preserves arbitrary model translation rotation scale and updates each frame',()=>{
  const {model}=fixture(),planeY=-.01,reflection=createReflection(THREE,{planeY,baseColor:new THREE.Color(.1,.2,.3)}),root=reflection.load(model);
  for(const frame of [0,1,2]){
    model.position.set(frame+.2,.4+frame,-.3);model.rotation.set(.1*frame,.3*frame,-.2*frame);model.scale.set(1.1+frame,.8,1.4);
    draw(reflection);assertMirroredVertices(model,root,planeY);
  }
  assert.equal(root.matrixAutoUpdate,false);reflection.dispose();
});
test('reflection materials are independent non-blending depth-writing occluders with no livery callback',()=>{
  const {model}=fixture();model.traverse(o=>{if(o.isMesh)o.material.onBeforeCompile=shader=>{shader.uniforms.p7Livery={value:'forbidden'};};});
  const reflection=createReflection(THREE,{planeY:-.01,baseColor:new THREE.Color(.1,.2,.3)}),root=reflection.load(model);
  model.traverse(o=>{if(!o.isMesh)return;const reflected=root.getObjectByName(o.name);assert.notEqual(reflected.material,o.material);assert.equal(reflected.geometry,o.geometry);
    assert.equal(reflected.material.transparent,true);assert.equal(reflected.material.blending,THREE.NoBlending);assert.equal(reflected.material.depthWrite,true);assert.equal(reflected.material.side,THREE.FrontSide);assert.equal(reflected.frustumCulled,false);
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};reflected.material.onBeforeCompile(shader);assert.equal(shader.uniforms.p7Livery,undefined);
  });reflection.dispose();
});
test('paint tint follows custom body color without recoloring other reflected materials',()=>{
  const {model}=fixture(),base=new THREE.Color(.1,.2,.3),paint=createPaint(THREE,{storage:null});paint.load(model);
  const reflection=createReflection(THREE,{planeY:-.01,baseColor:base}),root=reflection.load(model),glassOriginal=root.getObjectByName('window').material.color.clone();paint.syncReflection(root,base);paint.setColor('#ff0000');
  const body=root.getObjectByName('body').material,glass=root.getObjectByName('window').material;
  assert.ok(Math.abs(body.color.r-.1)<1e-10);assert.ok(Math.abs(body.color.g-.2*.28)<1e-10);assert.ok(Math.abs(body.color.b-.3*.28)<1e-10);
  assert.deepEqual(glass.color,glassOriginal);paint.reset();assert.deepEqual(body.color,base);reflection.dispose();paint.dispose();
});
test('reflection resolves into a depth target before one softly filtered ground composite',()=>{
  const {model}=fixture(),reflection=createReflection(THREE,{planeY:-.01}),root=reflection.load(model),renderer=draw(reflection);
  const renders=renderer.calls.filter(c=>c[0]==='render');assert.equal(renders.length,1);
  const [,scene,,target]=renders[0];assert.equal(scene.children.length,1);assert.equal(scene.children[0],root);assert.ok(target.isWebGLRenderTarget);assert.equal(target.depthBuffer,true);
  assert.equal(target.width,768);assert.equal(target.height,480);assert.equal(target.texture.generateMipmaps,false);
  const surface=reflection.surface;assert.ok(surface.isMesh);assert.equal(surface.material.transparent,true);assert.equal(surface.material.depthWrite,false);
  assert.equal(surface.material.uniforms.mirrorMap.value,target.texture);assert.equal(surface.material.uniforms.texel.value.x,1/768);assert.equal(surface.material.uniforms.texel.value.y,1/480);
  assert.ok(surface.position.y>=-.01&&surface.position.y<0);assert.equal(surface.rotation.x,-Math.PI/2);
  assert.match(surface.material.fragmentShader,/for\(int x=-1;x<=1;x\+\+\)/);assert.match(surface.material.fragmentShader,/for\(int y=-1;y<=1;y\+\+\)/);
  assert.match(surface.material.fragmentShader,/s\.rgb\*s\.a/,'filter is alpha weighted to avoid opaque dark outlines');
  reflection.dispose();
});
test('offscreen pass restores active target, clear state and tone mapping even on render failure',()=>{
  const {model}=fixture(),reflection=createReflection(THREE),renderer=rendererFixture();reflection.load(model);
  const priorTarget=new THREE.WebGLRenderTarget(4,4);renderer.setRenderTarget(priorTarget);
  const oldColor=renderer.getClearColor(new THREE.Color()).clone(),oldAlpha=renderer.getClearAlpha(),oldTone=renderer.toneMapping;
  const render=renderer.render;renderer.render=()=>{assert.equal(renderer.toneMapping,THREE.NoToneMapping);throw Error('test render failure');};
  assert.throws(()=>draw(reflection,renderer),/test render failure/);
  assert.equal(renderer.getRenderTarget(),priorTarget);assert.deepEqual(renderer.getClearColor(new THREE.Color()),oldColor);assert.equal(renderer.getClearAlpha(),oldAlpha);assert.equal(renderer.toneMapping,oldTone);
  renderer.render=render;draw(reflection,renderer);assert.equal(renderer.getRenderTarget(),priorTarget);
  reflection.dispose();priorTarget.dispose();
});
test('reflection dispose releases its target, materials and surface but keeps source geometry alive',()=>{
  const {model}=fixture(),reflection=createReflection(THREE),root=reflection.load(model),renderer=draw(reflection);
  const target=renderer.calls.find(c=>c[0]==='render')[3],counts={target:0,surface:0,surfaceMaterial:0,originalGeometry:0,originalMaterial:0,mirrorMaterials:0};
  target.addEventListener('dispose',()=>counts.target++);reflection.surface.geometry.addEventListener('dispose',()=>counts.surface++);reflection.surface.material.addEventListener('dispose',()=>counts.surfaceMaterial++);
  model.traverse(o=>{if(o.isMesh){o.geometry.addEventListener('dispose',()=>counts.originalGeometry++);o.material.addEventListener('dispose',()=>counts.originalMaterial++);}});
  let meshCount=0;root.traverse(o=>{if(o.isMesh){meshCount++;o.material.addEventListener('dispose',()=>counts.mirrorMaterials++);}});
  const scene=new THREE.Scene();scene.add(reflection.surface);reflection.dispose();reflection.dispose();
  assert.deepEqual(counts,{target:1,surface:1,surfaceMaterial:1,originalGeometry:0,originalMaterial:0,mirrorMaterials:meshCount});assert.equal(reflection.surface.parent,null);
  const renderCount=renderer.calls.length;draw(reflection,renderer);assert.equal(renderer.calls.length,renderCount);
});
test('reflection preserves source multi-material slots and honors source mesh visibility',()=>{
  const {model,paint,glass}=fixture(),mixed=new THREE.Mesh(new THREE.BoxGeometry(),[paint,glass]);mixed.name='mixed';model.add(mixed);model.getObjectByName('door').visible=false;
  const reflection=createReflection(THREE),root=reflection.load(model),mirror=root.getObjectByName('mixed');
  assert.ok(Array.isArray(mirror.material));assert.equal(mirror.material.length,2);assert.notEqual(mirror.material[0],paint);assert.notEqual(mirror.material[1],glass);assert.equal(root.getObjectByName('door').visible,false);
  reflection.dispose();
});

test('offscreen pass refreshes a camera parented outside the mirror scene before rendering',()=>{
  const {model}=fixture(),reflection=createReflection(THREE),renderer=rendererFixture();reflection.load(model);
  const scene=new THREE.Scene(),rig=new THREE.Group(),camera=new THREE.PerspectiveCamera(45,1.6,.1,100);
  scene.add(rig);rig.add(camera);camera.position.set(5,4,8);scene.updateMatrixWorld(true);
  const render=renderer.render;
  for(const frame of [1,2,3]){
    rig.position.set(frame,.2*frame,-frame);rig.rotation.y=.12*frame;
    camera.position.set(5-frame,4+frame,8);camera.lookAt(0,1,0);
    // lookAt updates the world matrix before changing the quaternion; both
    // the latest quaternion and subsequently moved parent must be refreshed.
    rig.position.x+=.5;
    const expectedParent=new THREE.Matrix4().compose(rig.position,rig.quaternion,rig.scale);
    const expectedLocal=new THREE.Matrix4().compose(camera.position,camera.quaternion,camera.scale);
    const expected=new THREE.Matrix4().multiplyMatrices(expectedParent,expectedLocal);
    renderer.render=(mirrorScene,activeCamera)=>{
      render(mirrorScene,activeCamera);
      expected.elements.forEach((value,i)=>assert.ok(Math.abs(activeCamera.matrixWorld.elements[i]-value)<1e-10,`world matrix element ${i}, frame ${frame}`));
      const inverse=expected.clone().invert();
      inverse.elements.forEach((value,i)=>assert.ok(Math.abs(activeCamera.matrixWorldInverse.elements[i]-value)<1e-10,`view matrix element ${i}, frame ${frame}`));
    };
    reflection.render(renderer,camera);
  }
  reflection.dispose();
});
