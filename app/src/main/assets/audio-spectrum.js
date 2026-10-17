/* P7 native-FFT adapter/compositor. Geometry comes from the MIT libraries in vendor/.
 * All four styles share the app RAF. Ribbon is frequency-history art, never PCM. */
(function(root){'use strict';
var W=1024,H=256;
function surface(){var c=document.createElement('canvas');c.width=W;c.height=H;return c;}
function Spectrum(canvas,settings){
 this.canvas=canvas;this.ctx=canvas.getContext('2d');this.state=new root.P7SpectrumState.State();this.style=settings.style;this.enabled=settings.enabled;this.layer=surface();this.old=surface();this.oldCtx=this.old.getContext('2d');this.fade=1;this.width=1;this.height=1;this.last=null;this.phase=0;this.revision=0;this.source=null;this.disposed=false;this.gradient=null;this.renderer=null;this.host=null;this.bytes=new Uint8Array(32);this.peaks=new Float32Array(32);this.holds=new Float64Array(32);this.makeRenderer();
}
Spectrum.prototype.makeRenderer=function(){
 if(this.style==='bands'){
  this.host=document.createElement('div');
  this.renderer=new root.SiriWave({container:this.host,width:W,height:H,ratio:1,style:'ios9',autostart:false,pixelDepth:.12,amplitude:0,speed:0,lerpSpeed:1,curveDefinition:[{color:'35, 216, 238'},{color:'117, 85, 244'},{color:'245, 66, 157'}],ranges:{noOfCurves:[2,3],amplitude:[.6,1],width:[1.4,2.8],offset:[-2,2]}});
 }else if(this.style==='led'){this.ledSurface=surface();this.ledSurface.width=640;this.renderer=new root.P7WaveCubes.Cubes({count:32,gap:2,cubeHeight:6,frequencyBand:null,top:true,fillColor:'#fff',lineColor:'transparent',lineWidth:0,radius:1});}
 else this.renderer=new root.SVModes[this.style](this.layer);
};
Spectrum.prototype.releaseRenderer=function(){if(!this.renderer)return;if(this.renderer.dispose)this.renderer.dispose();if(this.renderer.glow){this.renderer.glow.scratch.width=this.renderer.glow.scratch.height=1;this.renderer.glow=null;}if(this.ledSurface){this.ledSurface.width=this.ledSurface.height=1;this.ledSurface=null;}this.renderer=null;this.host=null;};
Spectrum.prototype.setStyle=function(style){if(this.disposed||root.P7SpectrumState.styles.indexOf(style)<0||style===this.style)return;this.oldCtx.clearRect(0,0,W,H);this.oldCtx.drawImage(this.layer,0,0);this.fade=0;this.oldStyle=this.style;this.releaseRenderer();this.style=style;this.layer.getContext('2d').clearRect(0,0,W,H);this.peaks.fill(0);this.makeRenderer();};
Spectrum.prototype.resize=function(w,h,dpr){if(this.disposed)return;this.width=Math.max(1,w);this.height=Math.max(1,h);this.dpr=Math.max(1,Math.min(2,dpr||1));this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';this.canvas.width=Math.max(1,Math.round(w*this.dpr));this.canvas.height=Math.max(1,Math.round(h*this.dpr));this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);};
Spectrum.prototype.reset=function(){this.state.reset();this.source=null;this.last=null;this.peaks.fill(0);this.holds.fill(0);this.fade=1;if(this.renderer&&this.renderer.hist)this.renderer.hist.length=0;if(this.layer)this.layer.getContext('2d').clearRect(0,0,W,H);};
Spectrum.prototype.getBars=function(count){var out=new Float32Array(count),v=this.state.values;for(var i=0;i<count;i++){var p=i*63/Math.max(1,count-1),j=Math.floor(p);out[i]=v[j]+(v[Math.min(63,j+1)]-v[j])*(p-j);}return out;};
Spectrum.prototype.getSpectrumCurve=function(count){
 // A smooth signed contour of frequency magnitudes, not time-domain samples.
 var out=new Float32Array(count),v=this.state.values,mean=this.state.energy;
 for(var i=0;i<count;i++){var p=i*63/(count-1),j=Math.floor(p),a=v[Math.max(0,j-1)],b=v[j],c=v[Math.min(63,j+1)],d=v[Math.min(63,j+2)],t=p-j;var sm=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);out[i]=Math.max(-1,Math.min(1,(sm-mean)*2.2))*Math.sin(Math.PI*i/(count-1));}return out;
};
Spectrum.prototype.update=function(now,frame,media,enabled){if(this.disposed)return;this.dt=this.last===null?1/60:Math.min(.25,Math.max(0,(now-this.last)/1000));this.last=now;this.now=now;this.enabled=enabled;if(frame!==this.source){this.source=frame;this.revision++;}this.state.update(now,frame,media,enabled);this.fade=Math.min(1,this.fade+this.dt/.38);if(this.state.energy>0)this.phase+=this.dt;if(!enabled){this.reset();return;}};
Spectrum.prototype.render=function(day){var c=this.layer.getContext('2d'),energy=this.state.energy,v=this.state.values;c.clearRect(0,0,W,H);if(!energy){if(this.renderer.hist)this.renderer.hist.length=0;return;}
 if(this.style==='bands'){
  var r=this.renderer;r.ctx.clearRect(0,0,W,H);r.setAmplitude(Math.min(4.5,energy*10.5));r.setSpeed((.045+energy*.14)*this.dt*60);r.lerp('amplitude');r.lerp('speed');
  // Pinned SiriWave exposes per-curve fade steps: preserve its 60fps fade time at low FPS.
  r.curves.forEach(function(curve){curve.DESPAWN_FACTOR=.02*Math.min(15,this.dt*60);},this);r.draw();c.drawImage(r.canvas,0,0);
 }else if(this.style==='led'){
  for(var i=0;i<32;i++){var n=Math.max(v[i*2],v[i*2+1]);if(n>=this.peaks[i]){this.peaks[i]=n;this.holds[i]=this.now+180;}else if(!this.state.active||this.now>this.holds[i])this.peaks[i]=Math.max(n,this.peaks[i]-this.dt*(this.state.active?.7:2));this.bytes[i]=Math.round(n*255);}
  var lc=this.ledSurface.getContext('2d'),self=this;
  var grad=lc.createLinearGradient(0,0,640,0);(day?['#087f91','#216fc0','#7342be','#b42c85']:['#22e5d0','#3ca8ff','#a16eff','#f451b7']).forEach(function(col,i){grad.addColorStop(i/3,col);});
  function ledPass(peaks,opacity){lc.clearRect(0,0,640,H);if(peaks)for(var j=0;j<32;j++)self.bytes[j]=Math.round(self.peaks[j]*255);else for(var j=0;j<32;j++)self.bytes[j]=Math.round(Math.max(v[j*2],v[j*2+1])*255);self.renderer.draw(self.bytes,lc);lc.save();lc.globalCompositeOperation='source-in';lc.fillStyle=grad;lc.fillRect(0,0,640,H);lc.restore();c.save();c.globalAlpha=opacity;c.translate(0,220);c.scale(1,-1);c.drawImage(self.ledSurface,0,0,640,120,0,0,W,128);c.restore();}
  ledPass(true,.20);ledPass(false,1);c.save();c.globalAlpha=.17;c.drawImage(this.ledSurface,0,0,640,120,0,224,W,22);c.restore();
 }else{
  var self=this;this.renderer.draw({getBars:function(n){return self.getBars(n);},getSpectrumCurve:function(n){return self.getSpectrumCurve(n);},spectrumRevision:this.revision},{visualizer:{sensitivity:this.style==='terrain'?1.25:1.2,thickness:.65,lineWidth:3.4,glow:day?0:.30,colorMode:'rainbow',color:'#4adcf1',color2:'#e44fce'}},this.phase,this.dt);
 }
 // Source-in daylight tint improves contrast without changing upstream geometry.
 if(day){c.save();c.globalCompositeOperation='source-atop';c.fillStyle='rgba(0,20,50,.20)';c.fillRect(0,0,W,H);c.restore();}
};
Spectrum.prototype.draw=function(day){if(this.disposed)return;var c=this.ctx,w=this.width,h=this.height;c.clearRect(0,0,w,h);if(!this.enabled)return;this.render(day);var alpha=Math.min(1,this.state.energy*7),x=w*.035,span=w*.93,top=4,dh=h-48;
 function place(img,opacity,style){c.save();c.globalAlpha=opacity;c.drawImage(img,x,top,span,dh);c.restore();}
 // Snapshot crossfade needs one active renderer only; fast repeated switches replace snapshot.
 if(this.fade<1)place(this.old,(1-this.fade)*alpha,this.oldStyle||this.style);
 place(this.layer,this.fade*alpha,this.style);
 c.save();c.globalAlpha=1-alpha;c.strokeStyle=day?'rgba(28,87,111,.45)':'rgba(125,187,218,.40)';c.lineWidth=1;c.beginPath();c.moveTo(x,h-48);c.lineTo(w-x,h-48);c.stroke();c.restore();
};
Spectrum.prototype.dispose=function(){if(this.disposed)return;this.reset();this.releaseRenderer();this.layer.width=this.layer.height=this.old.width=this.old.height=this.canvas.width=this.canvas.height=1;this.layer=this.old=this.oldCtx=this.canvas=this.ctx=null;this.disposed=true;};
root.P7AudioSpectrum=Spectrum;
})(typeof globalThis!=='undefined'?globalThis:this);
