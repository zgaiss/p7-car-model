/* Presentation only: no media bridge, timing or scene changes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.P7LyricsDisplay = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif';
  // Iterate Unicode code points, so a surrogate pair is never cut in half.
  function wrap(text, measure, width, maxLines) {
    var chars = Array.from(String(text || '')), rows = [], line = '';
    for (var i = 0; i < chars.length; i++) {
      if (line && measure(line + chars[i]) > width) {
        if (rows.length === maxLines - 1) {
          var tail = Array.from(line);
          while (tail.length && measure(tail.join('') + '…') > width) tail.pop();
          rows.push(tail.join('') + '…');
          return rows;
        }
        rows.push(line); line = '';
      }
      line += chars[i];
    }
    rows.push(line);
    return rows;
  }
  function draw(ctx, width, height, lines, current, daylight) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Avoid browser-specific tracking support changing measurement / wrapping.
    if (typeof ctx.letterSpacing === 'string') ctx.letterSpacing = '0px';
    if (!lines.length) {
      ctx.font = '500 30px ' + FONT;
      ctx.fillStyle = daylight ? '#425867' : '#aab4be';
      ctx.shadowColor = daylight ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.7)'; ctx.shadowBlur = 5;
      ctx.fillText('暂无歌词', width * .44, height * .32);
    } else {
      // A stable current-line anchor prevents vertical jumps at track edges and
      // when adjacent lines wrap. Only one previous / next sentence competes.
      var anchor = current >= 0 ? current : 0;
      ctx.font = (current >= 0 ? '600 ' : '400 ') + '48px ' + FONT;
      var focusRows = wrap(lines[anchor].text, function (s) { return ctx.measureText(s).width; }, width * .78, 2);
      var gap = focusRows.length > 1 ? .17 : .13;
      for (var offset = -1; offset <= 1; offset++) {
        var index = anchor + offset;
        if (index < 0 || index >= lines.length) continue;
        var active = index === current;
        var size = offset === 0 ? 48 : 32;
        ctx.font = (active ? '600 ' : '400 ') + size + 'px ' + FONT;
        var rows = wrap(lines[index].text, function (s) { return ctx.measureText(s).width; }, width * .78, offset === 0 ? 2 : 1);
        var center = height * (.27 + offset * gap);
        ctx.fillStyle = daylight ? (active ? '#223541' : '#425867') : (active ? '#f3f1e9' : (offset === 0 ? '#c3cdd5' : '#9baab6'));
        ctx.globalAlpha = active || daylight ? 1 : (offset === 0 ? .9 : .76);
        ctx.shadowColor = daylight ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.8)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
        for (var j = 0; j < rows.length; j++) {
          ctx.fillText(rows[j], width * .44, center + (j - (rows.length - 1) / 2) * size * 1.32);
        }
      }
    }
    ctx.restore();
  }
  return { wrap: wrap, draw: draw };
}));
