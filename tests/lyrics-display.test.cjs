const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Display = require('../app/src/main/assets/lyrics-display.js');
const measure = s => Array.from(s).length * 10;
test('short lines stay intact; long lines wrap and truncate with an ellipsis', () => {
  assert.deepEqual(Display.wrap('微光', measure, 50, 2), ['微光']);
  assert.deepEqual(Display.wrap('abcdefghijklm', measure, 50, 2), ['abcde', 'fghi…']);
  assert.deepEqual(Display.wrap('abcdefghij', measure, 50, 2), ['abcde','fghij']);
  assert.deepEqual(Display.wrap('abcdefghijklm', measure, 50, 1), ['abcd…']);
});
test('Unicode symbols do not become broken surrogate pairs', () => {
  const rows = Display.wrap('🌟🌟🌟🌟🌟🌟', measure, 30, 1);
  assert.deepEqual(rows, ['🌟🌟…']);
});
function context(){return {calls:[],font:'',letterSpacing:'',clearRect(){},save(){},restore(){},measureText(s){return {width:Array.from(s).length*parseFloat(this.font.split(' ')[1])};},fillText(text,x,y){this.calls.push({text,x,y,font:this.font,color:this.fillStyle,alpha:this.globalAlpha});}};}
test('current line remains anchored, more readable than its neighbours, and preserves its size for long lines', () => {
  for (const current of [0,1,2]) {
    const ctx=context(); Display.draw(ctx,1024,512,[{text:'前一句'},{text:'当前句'},{text:'下一句'}],current);
    const active=ctx.calls.filter(x=>x.color==='#f3f1e9');
    assert.equal(active.length,1); assert.equal(active[0].y,512*.27); assert.match(active[0].font,/600 48px/);
    assert.ok(ctx.calls.every(x=>x.x===1024*.44 && x.y>0 && x.y<512));
  }
  const ctx=context();Display.draw(ctx,1024,512,[{text:'长'.repeat(100)}],0);
  assert.equal(ctx.calls.length,2); assert.ok(ctx.calls[1].text.endsWith('…'));
  assert.ok(ctx.calls.every(x=>x.font.startsWith('600 48px')));
});
test('empty and pre-roll states are quiet and never invent a current lyric', () => {
  const empty=context();Display.draw(empty,1024,512,[],-1);assert.equal(empty.calls[0].text,'暂无歌词');
  const intro=context();Display.draw(intro,1024,512,[{text:'还没开始'}],-1);assert.ok(intro.calls.every(x=>x.color!=='#f3f1e9'));
});
const html=fs.readFileSync('app/src/main/assets/index.html','utf8');
test('LRC metadata is hidden; timed tags, repeated tags and plain text still parse', () => {
  const source=html.slice(html.indexOf('      function parseLrc('),html.indexOf('      // ---------- v4：'));
  const ctx={};vm.createContext(ctx);vm.runInContext(source,ctx);
  assert.equal(ctx.parseLrc('[ar:示例]\n[ti:标题]').length,0);
  const rows=ctx.parseLrc('[00:01.00][00:02.00]微光\n[00:03:50]前行');
  assert.equal(rows.length,3);assert.equal(rows[2].t,3500);assert.equal(rows[0].text,'微光');
  assert.equal(ctx.parseLrc('普通文本')[0].text,'普通文本');
});
test('production references the renderer and preserves scene pose / bridge entry', () => {
  assert.match(html,/<script src="lyrics-display.js"><\/script>/);
  assert.match(html,/P7LyricsDisplay.draw\(lyricCtx3D/);
  assert.match(html,/var d = window.__lyricData/);
  assert.match(html,/lyricSprite3D.scale.set\(s \* 2.4, s \* 1.2, 1\)/);
  assert.match(html,/@media \(max-width: 520px\) \{\s*#songMeta/);
});
test('narrow fallback shares the current line and disables only the lyric sprite', () => {
  const source=html.slice(html.indexOf('      function updateLyricPanelVisibility()'),html.indexOf('      /** 每帧轮询原生推送对象'));
  const panel={style:{}},sprite={visible:true}; const ctx={lyricPanel:panel,lyricSprite3D:sprite,lastLyricTone:'night',currentSkyKey:'night',window:{innerWidth:390}};
  vm.createContext(ctx);vm.runInContext(source,ctx);ctx.updateLyricPanelVisibility();
  assert.equal(panel.style.display,'block');assert.equal(sprite.visible,false);
  ctx.window.innerWidth=1180;ctx.updateLyricPanelVisibility();
  assert.equal(panel.style.display,'none');assert.equal(sprite.visible,true);
  assert.match(html,/classList.toggle\('focus', i === \(idx < 0 \? 0 : idx\)\)/);
});

test('daylight uses dark high-contrast text without changing geometry', () => { const ctx=context();Display.draw(ctx,1024,512,[{text:'晴天'}],0,true);assert.equal(ctx.calls[0].color,'#223541');assert.equal(ctx.calls[0].alpha,1);assert.equal(ctx.calls[0].y,512*.27);});
