/* Local-only song display. Artwork is deliberately not inferred from album text or URI fields. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.P7SongMetadata = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STALE_MS = 5000;
  function text(value) { return typeof value === 'string' ? value.trim().slice(0, 2048) : ''; }
  function normalize(data) {
    var d = data || {}, song = text(d.song), artist = text(d.artist), id = text(d.mediaId);
    var state = data == null ? 'error' : d.mediaState;
    if (state !== 'available' && state !== 'empty' && state !== 'error') state = song || artist || id ? 'available' : 'empty';
    return {state: state, title: song || '未知歌曲', artist: artist,
      trackKey: id ? 'id:' + id : JSON.stringify([song, artist])};
  }
  function create(elements) {
    var lastGood = null, errorSince = null, lastView = '';
    function update(data, now) {
      now = typeof now === 'number' ? now : Date.now();
      var item = normalize(data), stale = !!(data && typeof data.ts === 'number' && now - data.ts > STALE_MS);
      if (stale) item.state = 'error';
      if (data == null && !lastGood && errorSince === null) {
        // Initial placeholder is not a confirmed no-media sample.
        item = {state: 'pending', title: '未播放歌曲', artist: '', trackKey: ''};
      } else if (item.state === 'error') {
        if (errorSince === null) errorSince = now;
        if (!stale && lastGood && now - errorSince < STALE_MS) item = lastGood;
        else item = {state: 'unavailable', title: '媒体信息暂不可用', artist: '', trackKey: ''};
      } else {
        errorSince = null;
        if (item.state === 'empty') item = {state: 'empty', title: '未播放歌曲', artist: '', trackKey: ''};
        lastGood = item;
      }
      var key = JSON.stringify([item.state, item.title, item.artist, item.trackKey]);
      if (key !== lastView) {
        lastView = key;
        elements.title.textContent = item.title;
        elements.artist.textContent = item.artist;
        elements.artist.hidden = !item.artist;
        elements.root.setAttribute('data-media-state', item.state);
      }
      return item;
    }
    return {update: update};
  }
  return {create: create, normalize: normalize, staleMs: STALE_MS};
}));
