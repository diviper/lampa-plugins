/*
 * torrents-sort.js — a shorter, saner torrent list for Lampa
 *
 * Drops releases the TV cannot play or cannot pull (4K on a Full HD screen,
 * dead releases with no seeders, broken zero-byte entries), keeps the list
 * sorted by seeders, and marks the releases that are the safe pick: Full HD
 * at a sensible size.
 *
 * Install: Settings → Extensions → Add plugin → https://diviper.github.io/lampa-plugins/torrents-sort.js
 */

(function () {
  'use strict';

  var CONFIG = {
    hide4K: true,               // a Full HD TV cannot play 2160p smoothly
    minSeeders: 1,              // 0 turns the check off
    minSizeGb: 0.3,             // drops broken entries with no real size
    forceSortBySeeders: true,   // sets Lampa's own sort order once
    markGoodPicks: true,
    goodResolution: ['FHD'],    // as TitleParser reports it: 4K, 2K, FHD, HD, SD
    goodSizeGb: [2, 12],
    badgeText: 'оптимально'
  };

  if (window.lampa_plugin_torrents_sort) return;
  window.lampa_plugin_torrents_sort = true;

  // the same test Lampa uses in its own quality filter
  var RE_4K = /(4k|uhd)[ \]|,]|2160[pр]|ultrahd/i;
  var GB = 1024 * 1024 * 1024;

  var css = [
    '.torrent-item--pick{box-shadow:inset 0.25em 0 0 0 #4caf50}',
    '.torrent-pick{display:inline-block;margin-left:.6em;padding:0 .5em;border-radius:.4em;',
    'background:#4caf50;color:#fff;font-size:.8em;line-height:1.6}'
  ].join('');

  function sizeOf(element) {
    if (typeof element.Size === 'number' && !isNaN(element.Size)) return element.Size;
    if (element.size) return Lampa.Utils.sizeToBytes(element.size + '');
    return 0;
  }

  function keep(element) {
    var title = (element.Title || '') + '';

    if (CONFIG.hide4K && RE_4K.test(title)) return false;
    if (CONFIG.minSeeders > 0 && (element.Seeders || 0) < CONFIG.minSeeders) return false;
    if (CONFIG.minSizeGb > 0 && sizeOf(element) < CONFIG.minSizeGb * GB) return false;

    return true;
  }

  function isGoodPick(element) {
    var general = element.general || {};
    if (CONFIG.goodResolution.indexOf(general.resolution) === -1) return false;

    var size = sizeOf(element) / GB;
    return size >= CONFIG.goodSizeGb[0] && size <= CONFIG.goodSizeGb[1];
  }

  // The torrents component has no prototype to patch, but every result passes
  // through Lampa.Parser.get first. Filtering there keeps the component's own
  // counters, filters and paging consistent.
  function wrapParser() {
    var original = Lampa.Parser.get;

    Lampa.Parser.get = function (object, oncomplite, onerror) {
      original(object, function (data) {
        if (data && data.Results && data.Results.length) {
          var filtered = data.Results.filter(keep);
          // never hand back an empty list: a short list beats no list
          if (filtered.length) data.Results = filtered;
        }
        oncomplite(data);
      }, onerror);
    };
  }

  function markPicks() {
    Lampa.Listener.follow('torrent', function (event) {
      if (event.type !== 'render' || !event.item) return;
      if (!isGoodPick(event.element)) return;

      event.item.addClass('torrent-item--pick');
      event.item.find('.torrent-item__title').append('<span class="torrent-pick">' + CONFIG.badgeText + '</span>');
    });
  }

  function start() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    wrapParser();
    if (CONFIG.forceSortBySeeders) Lampa.Storage.set('torrents_sort', 'Seeders');
    if (CONFIG.markGoodPicks) markPicks();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
