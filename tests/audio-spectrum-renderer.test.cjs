/* Real vendored renderers in a deterministic Canvas/DOM VM, no GPU pixel claims. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../app/src/main/assets');
function harness(){
 let now=1000,raf=0,timers=0,seed=12345;const canvases=[];
 function element(tag){const e={tag,style:{},width:1024,height:256,children:[],appendChild(c){this.children.push(c);c.parentNode=this;},remove(){this.removed=true;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}};
 if(tag==='canvas'){let calls=[];const ctx=new Proxy({canvas:e,calls,createLinearGradient(){return {addColorStop(){}};}},{get(o,k){if(k in o)return o[k];return (...args)=>{for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),`nonfinite ${k}`);calls.push([k,...args]);};}});e.getContext=()=>ctx;canvases.push(e);}return e;}
 const math=Object.create(Math);math.random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};class Clock extends Date{static now(){return now;}}
 const s={console,Math:math,Date:Clock,document:{createElement:element},getComputedStyle:()=>({width:'1024px',height:'256px'}),requestAnimationFrame(){raf++;return raf;},cancelAnimationFrame(){},setTimeout(){timers++;return timers;},clearTimeout(){}};s.window=s;s.self=s;vm.createContext(s);
 for(const f of ['audio-spectrum-state.js','vendor/siriwave/siriwave.umd.js','vendor/soundvisualizer/glow.js','vendor/soundvisualizer/ribbon.js','vendor/soundvisualizer/terrain.js','vendor/wave/cubes-2.0.5.js','audio-spectrum.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),s,{filename:f});
 return {s,canvases,element,clock(t){now=t;},counts:()=>({raf,timers}),make(style){const p=new s.P7AudioSpectrum(element('canvas'),{style,enabled:true});p.resize(1100,152,1);return p;}};
}
const frame=()=>Array.from({length:64},(_,i)=>.15+.6*Math.pow(Math.sin(i*.16),2));
for(const style of ['bands','ribbon','terrain','led'])test(`${style}: real renderer, pause to stable silence, disposal without scheduler`,()=>{
 const h=harness(),p=h.make(style);let f=frame();
 for(let i=0;i<120;i++){let t=1000+i*16;h.clock(t);if(i%10===0)f=frame();p.update(t,f,null,true);p.draw(i%2===0);}
 assert.ok(p.state.energy>.1);assert.deepEqual(h.counts(),{raf:0,timers:0});
 if(style==='led'){assert.equal(p.bytes.length,32);assert.equal(p.peaks.length,32);for(const x of p.bytes)assert.ok(x>=0&&x<=255);}
 for(let i=0;i<180;i++){const t=3000+i*16;h.clock(t);p.update(t,frame(),{status:1},true);p.draw(false);}
 assert.equal(p.state.energy,0);if(p.renderer.hist)assert.equal(p.renderer.hist.length,0);
 const c=p.ctx;c.calls.length=0;p.draw(false);const a=c.calls.map(x=>x[0]);c.calls.length=0;p.draw(false);assert.deepEqual(c.calls.map(x=>x[0]),a);assert.ok(a.includes('lineTo'));
 const r=p.renderer,scratch=r.glow?.scratch,internal=r.canvas,layer=p.layer,old=p.old,canvas=p.canvas;p.dispose();p.dispose();assert.equal(p.renderer,null);assert.equal(p.canvas,null);for(const c of [layer,old,canvas])assert.equal(c.width,1);if(scratch)assert.equal(scratch.width,1);if(internal&&style==='bands')assert.ok(internal.removed);assert.deepEqual(h.counts(),{raf:0,timers:0});
});
test('repeated switching disposes previous renderer and never starts RAF',()=>{const h=harness(),p=h.make('bands');for(let i=0;i<40;i++){const old=p.renderer,canvas=old.canvas,scratch=old.glow?.scratch;p.setStyle(['ribbon','terrain','led','bands'][i%4]);if(canvas&&old.opt)assert.ok(canvas.removed);if(scratch)assert.equal(scratch.width,1);p.update(1000+i*160,frame(),null,true);p.draw(false);}p.dispose();assert.deepEqual(h.counts(),{raf:0,timers:0});});
test('ribbon: true packet revisions, 26-row bound and signed finite contour',()=>{const h=harness(),p=h.make('ribbon');let f=frame();for(let i=0;i<40;i++){p.update(1000+i*160,f=frame(),null,true);p.draw(false);}assert.equal(p.renderer.hist.length,26);const first=p.renderer.hist[0];for(let i=1;i<9;i++){p.update(7240+i*16,f,null,true);p.draw(false);}assert.equal(p.renderer.hist[0],first);for(const v of p.getSpectrumCurve(168))assert.ok(Number.isFinite(v)&&v>=-1&&v<=1);p.dispose();});
test('SiriWave: 4 FPS retains visible growth with fixed-version fade adaptation',()=>{const h=harness(),p=h.make('bands');let maxY=0,maxAmplitude=0;for(let i=0;i<120;i++){const t=1000+i*250;h.clock(t);p.update(t,frame(),null,true);p.draw(false);for(const c of p.renderer.curves){maxY=Math.max(maxY,c.prevMaxY);maxAmplitude=Math.max(maxAmplitude,...c.amplitudes);assert.equal(c.DESPAWN_FACTOR,i===0?.02:.3);if(i>0)assert.equal(c.noOfCurves,2);}}assert.ok(maxY>10,`maxY=${maxY}`);assert.ok(maxAmplitude>.3);assert.ok(p.renderer.amplitude>1);assert.deepEqual(h.counts(),{raf:0,timers:0});p.dispose();});
test('disabled rendering is empty; reset clears history and resize caps DPR',()=>{const h=harness(),p=h.make('terrain');p.resize(1100,152,10);assert.equal(p.canvas.width,2200);p.update(1000,frame(),null,true);p.update(1160,frame(),null,true);p.draw(false);assert.ok(p.renderer.hist.length>0);p.update(1320,frame(),null,false);p.ctx.calls.length=0;p.draw(false);assert.equal(p.state.energy,0);assert.equal(p.renderer.hist.length,0);assert.deepEqual(p.ctx.calls.map(c=>c[0]),['clearRect']);p.dispose();});
