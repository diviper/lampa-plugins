/*
 * stream-stats.js — playback diagnostics overlay for the Lampa player
 *
 * Shows, once a second, why a stream stutters: resolution, buffered seconds
 * ahead of the playhead, buffer fill rate (>1x means the source is faster
 * than playback), dropped frames and, for TorrServe streams, download speed,
 * peers and seeders.
 *
 * Works in the built-in Lampa player only; external players (VLC, MX) have
 * their own statistics screens.
 *
 * Install: Settings → Extensions → Add plugin → https://diviper.github.io/lampa-plugins/stream-stats.js
 */

(function () {
  'use strict';

  var CONFIG = {
    interval: 1000,          // ms between overlay updates
    torrentInterval: 2000,   // ms between TorrServe statistics requests
    hideWithPanel: false,    // true = show only while the player panel is visible
    position: 'top-right',   // top-left | top-right | bottom-left | bottom-right
    fontSize: '1.05em',

    warn: true,              // say it out loud when the stream cannot keep up
    warnAfterSeconds: 8,     // how long inflow must stay below 1x
    warnBufferSeconds: 10,   // and the buffer below this
    warnCooldown: 90000,     // ms between warnings
    warnText: 'Поток слабый: буфер не набирается. Смените раздачу или источник.',
    stallText: 'Видео встало: данные не приходят. Смените раздачу или источник.'
  };

  if (window.lampa_plugin_stream_stats) return;
  window.lampa_plugin_stream_stats = true;

  var box, timer, torrentTimer, network;
  var last = { time: 0, ahead: 0, position: -1 };
  var torrent = null;
  var weakSeconds = 0;
  var warnedAt = 0;

  var css = [
    '.stream-stats{position:absolute;z-index:8;padding:.55em .8em;border-radius:.6em;background:rgba(0,0,0,.55);',
    'color:#fff;font-size:' + CONFIG.fontSize + ';line-height:1.35;pointer-events:none;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.6)}',
    '.stream-stats--top-right{top:1.2em;right:1.2em}.stream-stats--top-left{top:1.2em;left:1.2em}',
    '.stream-stats--bottom-right{bottom:6em;right:1.2em}.stream-stats--bottom-left{bottom:6em;left:1.2em}',
    '.stream-stats__row span{opacity:.6;margin-right:.4em}',
    '.stream-stats--ok{color:#8be28b}.stream-stats--warn{color:#ffd166}.stream-stats--bad{color:#ff6b6b}'
  ].join('');

  function bytes(value, bits) {
    if (!value) return '0';
    var v = bits ? value * 8 : value;
    var units = bits ? ['бит/с', 'Кбит/с', 'Мбит/с', 'Гбит/с'] : ['Б', 'КБ', 'МБ', 'ГБ'];
    var i = 0;
    while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
    return (i ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];
  }

  function bufferedAhead(video) {
    var ranges = video.buffered;
    for (var i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= video.currentTime && video.currentTime <= ranges.end(i)) return ranges.end(i) - video.currentTime;
    }
    return 0;
  }

  function rowClass(value, good, ok) {
    return value >= good ? 'stream-stats--ok' : value >= ok ? 'stream-stats--warn' : 'stream-stats--bad';
  }

  // A stream that cannot refill its buffer will stall, so say so once in a
  // while instead of leaving the viewer to guess. Two cases count: playback
  // that is running but losing ground, and playback frozen for want of data.
  // A deliberate pause keeps readyState at HAVE_ENOUGH_DATA, so it stays quiet.
  function warn(video, rate, ahead, moving, dt, now) {
    if (!CONFIG.warn) return;

    var stalled = !moving && video.readyState < 3;
    var weak = !video.paused && rate < 1 && ahead < CONFIG.warnBufferSeconds;

    if (!stalled && !weak) {
      weakSeconds = 0;
      return;
    }

    weakSeconds += dt;

    if (weakSeconds < CONFIG.warnAfterSeconds || now - warnedAt < CONFIG.warnCooldown) return;

    warnedAt = now;
    weakSeconds = 0;
    Lampa.Noty.show(stalled ? CONFIG.stallText : CONFIG.warnText, { time: 6000 });
  }

  function render() {
    var video = Lampa.PlayerVideo.video();
    if (!box || !video || !video.buffered) return;

    var now = Date.now();
    var ahead = bufferedAhead(video);
    var moving = video.currentTime !== last.position;
    var dt = last.time ? (now - last.time) / 1000 : 0;
    var rate = dt > 0 && !video.paused ? (ahead - last.ahead) / dt + 1 : 1;
    var rows = [];

    if (video.videoWidth) rows.push('<div class="stream-stats__row"><span>видео</span>' + video.videoWidth + 'x' + video.videoHeight + '</div>');

    rows.push('<div class="stream-stats__row ' + rowClass(ahead, 15, 5) + '"><span>буфер</span>' + Math.round(ahead) + ' с</div>');

    // buffer growth relative to playback: below 1x the source falls behind
    if (dt > 0 && !video.paused) {
      rows.push('<div class="stream-stats__row ' + rowClass(rate, 1, 0.8) + '"><span>приток</span>' + rate.toFixed(2) + 'x</div>');
    }

    if (dt > 0) warn(video, rate, ahead, moving, dt, now);

    if (video.getVideoPlaybackQuality) {
      var q = video.getVideoPlaybackQuality();
      rows.push('<div class="stream-stats__row ' + rowClass(-q.droppedVideoFrames, 0, -50) + '"><span>кадры</span>' + q.droppedVideoFrames + ' пропущено из ' + q.totalVideoFrames + '</div>');
    }

    if (torrent) {
      rows.push('<div class="stream-stats__row ' + rowClass(torrent.download_speed || 0, 1500000, 500000) + '"><span>торрент</span>' + bytes(torrent.download_speed, true) + '</div>');
      rows.push('<div class="stream-stats__row"><span>пиры</span>' + (torrent.active_peers || 0) + ' / ' + (torrent.total_peers || 0) + ', сиды ' + (torrent.connected_seeders || 0) + '</div>');
    }

    last = { time: now, ahead: ahead, position: video.currentTime };
    box.innerHTML = rows.join('');
  }

  function pollTorrent(data) {
    var ip = Lampa.Torserver.ip();
    if (!ip || !data.url || data.url.indexOf(ip) === -1) return;

    var url = data.url.replace('&preload', '&stat').replace('&play', '&stat');
    if (url === data.url) return;

    network = new Lampa.Reguest();
    var tick = function () {
      network.timeout(1500);
      network.silent(url, function (result) { torrent = result.Torrent || result; }, function () {});
    };
    tick();
    torrentTimer = setInterval(tick, CONFIG.torrentInterval);
  }

  function show(data) {
    hide();
    box = document.createElement('div');
    box.className = 'stream-stats stream-stats--' + CONFIG.position;
    Lampa.Player.render().append(box);

    last = { time: 0, ahead: 0, position: -1 };
    torrent = null;
    weakSeconds = 0;
    warnedAt = 0;
    timer = setInterval(render, CONFIG.interval);
    pollTorrent(data);
  }

  function hide() {
    clearInterval(timer);
    clearInterval(torrentTimer);
    if (network) network.clear();
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
    torrent = null;
  }

  function start() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    Lampa.Player.listener.follow('start', show);
    Lampa.Player.listener.follow('destroy', hide);

    if (CONFIG.hideWithPanel) {
      Lampa.PlayerPanel.listener.follow('visible', function (event) {
        if (box) box.style.display = event.status ? '' : 'none';
      });
    }
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
