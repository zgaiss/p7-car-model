/* Depth-resolved, softly filtered ground reflection. No livery shader is copied. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.createCarReflection=factory;})(typeof window!=='undefined'?window:this,function(THREE,options){
  'use strict';
  options=options||{};
  var planeY=options.planeY===undefined?-0.01:options.planeY;
  var mirrorScene=new THREE.Scene(), model=null, root=null, disposed=false;
  var target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false});
  target.texture.generateMipmaps=false;
  var uniforms={mirrorMap:{value:target.texture},texel:{value:new THREE.Vector2(1,1)},strength:{value:0.27}};
  var surfaceMaterial=new THREE.ShaderMaterial({
    uniforms:uniforms,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
    vertexShader:'varying vec4 vClip; void main(){vClip=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=vClip;}',
    fragmentShader:'uniform sampler2D mirrorMap;uniform vec2 texel;uniform float strength;varying vec4 vClip;\n'+
      'void main(){vec2 uv=vClip.xy/vClip.w*0.5+0.5;vec4 sum=vec4(0.0);float weight=0.0;\n'+
      'for(int x=-1;x<=1;x++){for(int y=-1;y<=1;y++){float w=(x==0?2.0:1.0)*(y==0?2.0:1.0);vec4 s=texture2D(mirrorMap,uv+vec2(float(x),float(y))*texel*2.2);sum+=vec4(s.rgb*s.a,s.a)*w;weight+=w;}}\n'+
      'sum/=weight;if(sum.a<0.003)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,0.0001),sum.a*strength);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}'
  });
  var surface=new THREE.Mesh(new THREE.PlaneGeometry(300,300),surfaceMaterial);
  surface.name='soft_car_reflection';surface.rotation.x=-Math.PI/2;surface.position.y=planeY+0.001;surface.renderOrder=2;
  var mirrorMatrix=new THREE.Matrix4().set(1,0,0,0,0,-1,0,2*planeY,0,0,1,0,0,0,0,1);
  function updateTransform(){if(!root||!model)return;model.updateWorldMatrix(true,false);root.matrix.multiplyMatrices(mirrorMatrix,model.matrixWorld);root.matrixWorldNeedsUpdate=true;}
  function load(source){
    if(disposed||root)return root;model=source;root=model.clone(true);root.name='reflection';root.matrixAutoUpdate=false;
    root.traverse(function(o){
      if(!o.isMesh)return;o.frustumCulled=false;
      var originals=Array.isArray(o.material)?o.material:[o.material];
      var replacements=originals.map(function(original){
        var color=original.color?original.color.clone():new THREE.Color(0x24282c);
        color.multiplyScalar(0.32);
        var m=new THREE.MeshBasicMaterial({color:color,transparent:true,blending:THREE.NoBlending,depthWrite:true,side:THREE.FrontSide});
        // Resolve front-most geometry in the target first. Alpha is NOT blended per mesh.
        m.onBeforeCompile=function(shader){
          shader.uniforms.reflectionPlane={value:planeY};
          shader.vertexShader='varying float vReflectionY;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvReflectionY=(modelMatrix*vec4(position,1.0)).y;');
          shader.fragmentShader='uniform float reflectionPlane;varying float vReflectionY;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(vReflectionY>reflectionPlane+0.002)discard;diffuseColor.a=1.0-smoothstep(0.1,3.4,reflectionPlane-vReflectionY);if(diffuseColor.a<0.003)discard;');
        };
        m.customProgramCacheKey=function(){return 'p7-soft-ground-reflection-v1';};
        return m;
      });
      o.material=Array.isArray(o.material)?replacements:replacements[0];
      if(o.name==='Mesh.010')o.visible=false;
    });
    mirrorScene.add(root);updateTransform();return root;
  }
  var size=new THREE.Vector2(),clearColor=new THREE.Color();
  function render(renderer,camera){
    if(disposed||!root)return;updateTransform();
    // The camera belongs to the main scene, which this offscreen pass does not update.
    camera.updateWorldMatrix(true,false);
    renderer.getDrawingBufferSize(size);var ratio=Math.min(1,768/Math.max(size.x,size.y));
    var w=Math.max(1,Math.round(size.x*ratio)),h=Math.max(1,Math.round(size.y*ratio));
    if(target.width!==w||target.height!==h){target.setSize(w,h);uniforms.texel.value.set(1/w,1/h);}
    var oldTarget=renderer.getRenderTarget(),alpha=renderer.getClearAlpha(),tone=renderer.toneMapping;
    renderer.getClearColor(clearColor);
    try{renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.toneMapping=THREE.NoToneMapping;renderer.clear();renderer.render(mirrorScene,camera);}
    finally{renderer.setRenderTarget(oldTarget);renderer.setClearColor(clearColor,alpha);renderer.toneMapping=tone;}
  }
  function dispose(){if(disposed)return;disposed=true;if(root)root.traverse(function(o){if(o.isMesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){m.dispose();});});target.dispose();surface.geometry.dispose();surfaceMaterial.dispose();if(surface.parent)surface.parent.remove(surface);mirrorScene.clear();}
  return {load:load,render:render,surface:surface,updateTransform:updateTransform,dispose:dispose,planeY:planeY};
});
