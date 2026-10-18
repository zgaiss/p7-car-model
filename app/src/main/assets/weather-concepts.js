/* Isolated atmospheric concept preview. No weather service or location. */
(function(root){root.createWeatherAtmosphere=function(THREE,scene){
var previousFog=scene.fog,disposed=false,strength=1,targetStrength=1;
// World-distance fog affects distant ground; the near car stays before the near plane.
var fog=new THREE.Fog(0xbac2cd,8,30);scene.fog=fog;
// HDR background does not participate in Three fog. This depth-tested sky-only
// horizon haze proxy handles it, instead of whitening the entire scene or DOM.
var mat=new THREE.ShaderMaterial({uniforms:{uStrength:{value:1}},transparent:true,depthTest:true,depthWrite:false,toneMapped:false,vertexShader:'varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.99999,1.0);}',fragmentShader:'precision mediump float;uniform float uStrength;varying vec2 vUV;void main(){float horizon=exp(-pow((vUV.y-.50)/.25,2.0));float upper=exp(-pow((vUV.y-.73)/.37,2.0));float a=.62*horizon+.18*upper;vec3 color=mix(vec3(.68,.72,.78),vec3(.79,.81,.84),horizon);gl_FragColor=vec4(color,a*uStrength);}' });
var mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);mesh.frustumCulled=false;mesh.renderOrder=-10;scene.add(mesh);
return{setStrength:function(v){targetStrength=Math.max(0,Math.min(1,Number(v)||0));},isClear:function(){return targetStrength===0&&strength<0.001;},update:function(camera,target,dt){if(disposed)return;if(dt!==undefined)strength+=(targetStrength-strength)*(1-Math.exp(-Math.min(.05,Math.max(0,dt))*2));else strength=targetStrength;mat.uniforms.uStrength.value=strength;var d=camera.position.distanceTo(target);fog.near=d*1.15;fog.far=d*(1.15+3.2/Math.max(.001,strength));},dispose:function(){if(disposed)return;disposed=true;scene.remove(mesh);mesh.geometry.dispose();mat.dispose();if(scene.fog===fog)scene.fog=previousFog;}};
};})(window);
