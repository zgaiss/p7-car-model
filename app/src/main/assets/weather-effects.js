/* Offline weather visual prototype. Nebula 13.3.0 simulation; batched Points presentation. No network or location. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.createWeatherEffects=factory;})(typeof window!=='undefined'?window:this,function(THREE,options){
  'use strict'; options=options||{}; var wind=options.wind===true?1:0,strength=1,currentKind='none';
  var N=options.Nebula || (typeof Nebula!=="undefined"?Nebula:null);
  if(!N)throw new Error("Nebula 13.3.0 is required for this preview");
  var group=new THREE.Group();group.name='weather-background';
  var kinds=['rain','snow','stars'],counts={rain:160,snow:80,stars:100},layers={},disposed=false,time=0;
  var masks=Array.from({length:8},function(){return new THREE.Vector4(-3,-3,-2,-2);});
  function seed(i){var v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v);}
  kinds.forEach(function(kind,ki){
    var geometry=new THREE.BufferGeometry(),data=new Float32Array(counts[kind]*3);
    for(var i=0;i<counts[kind];i++){data[i*3]=seed(i*3+1);data[i*3+1]=seed(i*3+2);data[i*3+2]=seed(i*3+3);}
    geometry.setAttribute('position',new THREE.BufferAttribute(data,3));
    var seeds=new Float32Array(counts[kind]);for(var si=0;si<seeds.length;si++)seeds[si]=seed(si+9);geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
    var system=new N.System(200,undefined,ki+11), emitter=new N.Emitter();
    // Adapted from official SpriteRendererSnow: Position/BoxZone, Mass,
    // Radius, Life, RadialVelocity, RandomDrift and Gravity. Scale is screen-space.
    emitter.setRate(new N.Rate(counts[kind],1)).setInitializers([
      new N.Mass(1),new N.Radius(new N.Span(1,2)),
      new N.Position(new N.BoxZone(1.95,kind==='stars'?0.65:1.4,0)),
      new N.Life(Infinity),new N.RadialVelocity(kind==='rain'?0.0035:kind==='snow'?0.0007:0,new N.Vector3D(0,-1,0),0)
    ]).setPosition({x:0,y:kind==='stars'?0.6:0.3,z:0});
    if(kind==='snow')emitter.setBehaviours([new N.RandomDrift(0.00002,0.000002,0,0.05),new N.Gravity(0.000002)]);
    system.addEmitter(emitter);emitter.emit(1);emitter.life=Infinity;system.update(1/60);emitter.stopEmit();
    if(kind==='rain'){emitter.damping=0;emitter.particles.forEach(function(p,idx){var speed=0.7+seed(idx+9)*0.85;p.velocity.set(speed*0.035,-speed,0);});}
    if(kind==='snow'){
      // Depth links diameter and fall speed; Nebula still owns integration/lifetime.
      emitter.damping=0;
      emitter.particles.forEach(function(p,idx){var depth=seed(idx+9);p.position.set(seed(idx*3+21)*2-1,seed(idx*3+22)*1.45-0.45,0);p.velocity.set(0,-(0.035+depth*depth*0.085),0);});
    }
    if(kind==='stars'){
      // A sparse, irregular upper-sky field. Never seed stars into ground/reflection.
      emitter.particles.forEach(function(p,idx){
        var x=seed(idx*7+101)*1.96-0.98,y=0.3+Math.pow(seed(idx*7+102),0.72)*0.67;
        if(seed(idx*7+103)<0.38)x=x*0.55-0.32;
        p.position.set(x,y,0);p.velocity.set(0,0,0);
      });
    }
    var uniforms={uTime:{value:0},uWind:{value:wind},uAlpha:{value:0},uDpr:{value:1},uKind:{value:ki},uMasks:{value:masks},uMaskCount:{value:0},uHeight:{value:900}};
    var material=new THREE.ShaderMaterial({uniforms:uniforms,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,
      vertexShader:'uniform float uDpr;uniform highp float uWind;uniform int uKind;attribute float aSeed;varying float vSeed;varying vec2 vScreen;void main(){vSeed=aSeed;vScreen=position.xy;gl_Position=vec4(position.xy,0.9999,1.0);gl_PointSize=(uKind==0?10.0+aSeed*12.0:(uKind==1?(1.8+aSeed*aSeed*4.2)*(1.0+uWind*.7):1.3+aSeed*aSeed*2.3))*uDpr;}',
      fragmentShader:'precision mediump float;uniform float uAlpha,uTime;uniform highp float uWind;uniform int uKind,uMaskCount;uniform vec4 uMasks[8];varying float vSeed;varying vec2 vScreen;void main(){float mask=1.0;for(int i=0;i<8;i++){if(i<uMaskCount){vec4 r=uMasks[i];float inside=smoothstep(r.x-0.018,r.x,vScreen.x)*(1.0-smoothstep(r.z,r.z+0.018,vScreen.x))*smoothstep(r.y-0.018,r.y,vScreen.y)*(1.0-smoothstep(r.w,r.w+0.018,vScreen.y));mask*=1.0-inside;}}vec2 p=gl_PointCoord-0.5;float a;vec3 color;if(uKind==0){a=(1.0-smoothstep(0.012+uWind*.006,0.045+uWind*.012,abs(p.x+p.y*(0.035-uWind*.52))))*(1.0-smoothstep(0.25,0.5,abs(p.y)));color=mix(mix(vec3(0.40,0.48,0.56),vec3(0.72,0.78,0.85),vSeed),vec3(.28,.36,.45),uWind*.5);}else if(uKind==1){if(uWind>0.0){p=vec2(p.x*.86+p.y*.5,-p.x*.5+p.y*.86);p.y*=1.65;}a=(1.0-smoothstep(0.06,0.5,length(p)))*(0.38+vSeed*0.48+uWind*.18);color=vec3(0.88,0.93,1.0);}else{float twinkle=0.92+0.08*sin(uTime*(0.45+vSeed*0.45)+vSeed*39.0);a=(1.0-smoothstep(0.03,0.46,length(p)))*(0.22+vSeed*vSeed*vSeed*0.72)*twinkle*smoothstep(0.28,0.48,vScreen.y);color=mix(vec3(0.72,0.82,1.0),vec3(1.0,0.94,0.82),vSeed);}gl_FragColor=vec4(color,a*uAlpha*mask*(0.75+vSeed*0.25));if(gl_FragColor.a<0.005)discard;}'
    });
    var points=new THREE.Points(geometry,material);points.frustumCulled=false;points.renderOrder=1;points.raycast=function(){};points.visible=false;group.add(points);layers[kind]={points:points,alpha:0,target:0,system:system,emitter:emitter,data:data};
  });
  function setKind(kind){if(disposed)return;currentKind=kind; kinds.forEach(function(k){layers[k].target=k===kind?(k==='rain'?(.4+wind*.22):k==='snow'?(.78+wind*.17):.9)*strength:0;});}
  function update(dt,rects,width,height,dpr){if(disposed)return;dt=Math.min(0.05,Math.max(0,Number(dt)||0));time+=dt;rects=rects||[];var n=Math.min(rects.length,8);
    for(var i=0;i<n;i++){var r=rects[i];masks[i].set(r.left/width*2-1,1-r.bottom/height*2,r.right/width*2-1,1-r.top/height*2);}
    kinds.forEach(function(k){var l=layers[k];l.alpha+=(l.target-l.alpha)*(1-Math.exp(-dt*2));if(Math.abs(l.target-l.alpha)<0.001)l.alpha=l.target;l.points.visible=l.alpha>0;
      if(l.points.visible && dt>0){
        if(k==='snow')l.emitter.particles.forEach(function(p,idx){var depth=seed(idx+9);p.velocity.set(Math.sin(time*(0.35+depth*0.3)+seed(idx+31)*Math.PI*2)*(0.008+depth*0.012),-(0.035+depth*depth*0.085),0);});
        if(wind && k!=='stars')l.emitter.particles.forEach(function(p){var gust=.85+.15*Math.sin(time*.7);if(k==='rain')p.velocity.x=Math.abs(p.velocity.y)*(.035+.45*wind*gust);else p.velocity.x+=.085*wind*gust;});
        l.system.tick(dt);var particles=l.emitter.particles;for(var pi=0;pi<Math.min(particles.length,counts[k]);pi++){var p=particles[pi];if(k!=='stars' && p.position.y < -0.45){p.position.y=1.0;if(k==='rain'){var rs=0.7+seed(pi+9)*0.85;p.velocity.set(rs*0.035,-rs,0);p.position.x=seed(pi*17+Math.floor(time)*3)*1.95-0.975;}else p.velocity.y=-(0.035+Math.pow(seed(pi+9),2)*0.085);}if(k==='snow'||(wind&&k==='rain')){if(p.position.x>1.03)p.position.x=-1.03;if(p.position.x< -1.03)p.position.x=1.03;}l.data[pi*3]=p.position.x;l.data[pi*3+1]=p.position.y;l.data[pi*3+2]=0;}l.points.geometry.setDrawRange(0,Math.min(particles.length,counts[k]));l.points.geometry.attributes.position.needsUpdate=true;}
      var u=l.points.material.uniforms;u.uWind.value=wind;u.uTime.value=time;u.uAlpha.value=l.alpha;u.uMaskCount.value=n;u.uDpr.value=Math.min(2,dpr||1);u.uHeight.value=height;});
  }
  function dispose(){if(disposed)return;disposed=true;kinds.forEach(function(k){layers[k].system.destroy();});group.children.slice().forEach(function(p){p.geometry.dispose();p.material.dispose();group.remove(p);});if(group.parent)group.parent.remove(group);}
  return {group:group,setKind:setKind,setStrength:function(v){strength=Math.max(0,Math.min(1,Number(v)||0));setKind(currentKind);},setWind:function(v){wind=Math.max(0,Math.min(1,Number(v)||0));setKind(currentKind);},update:update,dispose:dispose,getState:function(){return {time:time,disposed:disposed,counts:counts,engine:'three-nebula@13.3.0',particleCounts:kinds.map(function(k){return layers[k].system.getCount();}),visible:kinds.filter(function(k){return layers[k].points.visible;})};}};
});
