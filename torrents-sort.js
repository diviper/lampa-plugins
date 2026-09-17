/*
 * torrents-sort.js — picks the torrent you actually want
 *
 * Lampa sorts releases by seeders, which on a Russian tracker means a 790 GB
 * Blu-ray remux with only English audio can sit above a 1080p dub that plays
 * fine on a TV. This plugin scores every release and sorts by the score:
 *
 *   - Russian audio and the kind of voice-over (dub, multi-voice, single);
 *   - resolution that suits a Full HD screen, source quality, HDR;
 *   - bitrate per episode, so heavy remuxes that stall over Wi-Fi sink;
 *   - for series, whether the release contains the episode you stopped at;
 *   - the voice-over you picked for this title before;
 *   - seeders, on a log scale so a few more do not outweigh the rest.
 *
 * Each row shows its score and the reasons. Inside a release the file list
 * jumps to the episode you stopped at and starts it after a short countdown;
 * any key cancels.
 *
 * Install: Settings → Extensions → Add plugin → https://diviper.github.io/lampa-plugins/torrents-sort.js
 */

(function () {
  'use strict';

  var CONFIG = {
    // what to drop before the list is built
    hide4K: true,               // a Full HD TV cannot play 2160p smoothly
    hideCam: true,              // CAMRip, TS, telecine
    hideNoRussian: false,       // keep them, just at the bottom
    minSeeders: 1,
    dedupe: true,               // same release on several trackers

    // how to sort and what to show
    smartSort: true,            // replaces the default "popular" order
    showScore: true,
    markBest: true,
    bestMinScore: 50,

    // playback targets for a Full HD TV over Wi-Fi, per episode or film
    minMbit: { 1080: 2, 720: 1, 480: 0.5 },
    comfortMbit: 14,
    heavyMbit: 25,
    runtimeAnime: 24,           // minutes, when the card does not say
    runtimeSeries: 45,
    runtimeFilm: 110,

    // file list inside a release
    focusEpisode: true,
    autoPlay: true,
    autoPlaySeconds: 8,
    nextThreshold: 90,          // percent after which the episode counts as finished

    learnVoices: true,
    storageKey: 'torrents_smart',
    historyLimit: 100
  };

  if (window.lampa_plugin_torrents_smart) return;
  window.lampa_plugin_torrents_smart = true;

  var GB = 1024 * 1024 * 1024;
  var RE_4K = /(4k|uhd)[ \]|,]|2160[pр]|ultrahd/i;
  var RE_CAM = /(^|[^a-z])(cam|camrip|ts|telesync|tc|telecine)([^a-z]|$)|экранк|звук с ts/i;
  var RE_HDR = /(^|[^a-z])(hdr|hdr10|dolby vision|dv)([^a-z]|$)/i;

  var SOURCES = [
    [/web-?dl/i, 'WEB-DL', 16],
    [/web-?rip/i, 'WEBRip', 14],
    [/remux/i, 'Remux', 8],
    [/blu-?ray|bd-?rip|bdrip/i, 'BDRip', 15],
    [/hdtv-?rip|hdtv/i, 'HDTV', 9],
    [/hdrip/i, 'HDRip', 8],
    [/dtv-?rip|sat-?rip|tv-?rip/i, 'TVRip', 6],
    [/dvd/i, 'DVD', 5]
  ];

  // Russian tracker shorthand for voice-overs: ДБ dub, ЛД amateur dub,
  // ЛМ/ПМ multi-voice, ПД/ЛД two-voice, ЛО/ПО/АП single voice, СТ subtitles.
  var TIERS = [
    [/дубляж|(^|[^а-яёa-z])дб([^а-яёa-z]|$)|(^|[^a-z])dub(bing|bed)?([^a-z]|$)/i, 4, 'дубляж'],
    [/многоголос|(^|[^а-яёa-z])(лм|пм|лд)([^а-яёa-z]|$)|(^|[^a-z])mvo([^a-z]|$)/i, 3, 'многоголосый'],
    [/двухголос|(^|[^а-яёa-z])(пд|лд)([^а-яёa-z]|$)|(^|[^a-z])dvo([^a-z]|$)/i, 2, 'двухголосый'],
    [/одноголос|авторск|(^|[^а-яёa-z])(ло|по|ап)([^а-яёa-z]|$)|(^|[^a-z])(avo|vo)([^a-z]|$)/i, 1, 'одноголосый']
  ];
  var RE_RUS = /(^|[^a-z])rus([^a-z]|$)|русск|(^|[^а-яёa-z])(ру|рус)([^а-яёa-z]|$)/i;
  var RE_FOREIGN_ONLY = /(^|[^a-z])(eng|jap|jpn|ukr|original)([^a-z]|$)|укр|хвіст|серій/i;
  var TIER_WORDS = /^(дубляж|многоголосый|двухголосый|одноголосый|dub|mvo|dvo|avo|vo|sub|ст|original|оригинал|rus|eng|jap|ukr)$/i;

  var css = [
    '.tsmart{display:flex;flex-wrap:wrap;align-items:center;margin-top:.45em;font-size:.82em;line-height:1.5}',
    '.tsmart>span{margin:0 .4em .25em 0;padding:0 .5em;border-radius:.4em;background:rgba(255,255,255,.1);white-space:nowrap}',
    '.tsmart .tsmart__score{font-weight:700;color:#000}',
    '.tsmart .tsmart__score--good{background:#4caf50}',
    '.tsmart .tsmart__score--ok{background:#ffc107}',
    '.tsmart .tsmart__score--bad{background:#ef5350;color:#fff}',
    '.tsmart .tsmart__best{background:#4caf50;color:#fff;font-weight:700}',
    '.tsmart .tsmart__warn{background:rgba(239,83,80,.25);color:#ffb4ab}',
    '.tsmart .tsmart__good{background:rgba(76,175,80,.25);color:#b9f6ca}',
    '.torrent-item--best{box-shadow:inset .3em 0 0 0 #4caf50}',
    '.tsmart-resume{display:inline-block;margin-right:.6em;padding:0 .5em;border-radius:.4em;background:#4caf50;color:#fff;font-size:.9em;font-weight:700}'
  ].join('');

  // --- storage -------------------------------------------------------------

  function memory() {
    var data = Lampa.Storage.get(CONFIG.storageKey, '{}');
    if (!data || typeof data !== 'object') data = {};
    if (!data.cards) data.cards = {};
    if (!data.global) data.global = {};
    return data;
  }

  function save(data) {
    var keys = Object.keys(data.cards);
    while (keys.length > CONFIG.historyLimit) delete data.cards[keys.shift()];
    Lampa.Storage.set(CONFIG.storageKey, data);
  }

  // --- reading a release title -----------------------------------------------

  function text(element) {
    return (element.Title || element.title || '') + '';
  }

  function sizeOf(element) {
    if (typeof element.Size === 'number' && !isNaN(element.Size)) return element.Size;
    if (element.size) return Lampa.Utils.sizeToBytes(element.size + '');
    return 0;
  }

  function seedersOf(element) {
    var seeds = parseInt(element.Seeders, 10);
    return isNaN(seeds) ? 0 : seeds;
  }

  function resolutionOf(element, title, source) {
    var q = element.info ? parseInt(element.info.quality, 10) : 0;
    if (q >= 2160 || RE_4K.test(title)) return 2160;
    if (/1080[pр]|full ?hd/i.test(title)) return 1080;
    if (/1440[pр]/i.test(title)) return 1440;
    if (/720[pр]/i.test(title)) return 720;
    if (/480[pр]|dvd/i.test(title)) return 480;
    // the tracker reports 480 whenever it does not know; trust it only for SD sources
    if (q === 480 && !source.label) return 0;
    return q || 0;
  }

  function sourceOf(title) {
    for (var i = 0; i < SOURCES.length; i++) {
      if (SOURCES[i][0].test(title)) return { label: SOURCES[i][1], score: SOURCES[i][2] };
    }
    return { label: '', score: 7 };
  }

  function voicesOf(element, title) {
    var out = [];

    function add(name) {
      name = (name || '').replace(/&amp;/g, '&').trim();
      if (!name || name.length > 40 || TIER_WORDS.test(name) || /^\d/.test(name)) return;
      if (/сезон|серии|серий|web|rip|1080|720|hevc|x26|bd|dvd|hdtv|ova|фильм/i.test(name)) return;
      for (var i = 0; i < out.length; i++) if (out[i].toLowerCase() === name.toLowerCase()) return;
      out.push(name);
    }

    ((element.info && element.info.voices) || []).forEach(add);

    // "ЛД (Anything Group)", "ЛО, ЛМ (AniDUB)"
    var re = /\(([^()]{2,60})\)/g;
    var match;
    while ((match = re.exec(title))) {
      var before = title.slice(Math.max(0, match.index - 12), match.index);
      if (/(дб|лд|лм|ло|пм|пд|по|ап|mvo|dvo|avo|vo|дубляж)\s*,?\s*$/i.test(before)) match[1].split(',').forEach(add);
    }

    // "... | Дубляж | AniDUB" or "... от Deadmauvlad | DEEP, Anything Group, AniDUB"
    var tail = title.split('|').slice(1).join(',');
    if (tail) tail.split(',').forEach(add);

    return out;
  }

  function audioOf(element, title, voices) {
    var tier = 0;
    var label = '';

    for (var i = 0; i < TIERS.length; i++) {
      if (TIERS[i][0].test(title)) { tier = TIERS[i][1]; label = TIERS[i][2]; break; }
    }

    var info = (element.info && element.info.voices) || [];
    for (var v = 0; v < info.length; v++) {
      if (/дубляж/i.test(info[v]) && tier < 4) { tier = 4; label = 'дубляж'; }
    }

    var streams = (element.ffprobe || []).filter(function (s) { return s.codec_type === 'audio'; });
    var langs = streams.map(function (s) { return ((s.tags && s.tags.language) || '').toLowerCase(); });
    var heavy = streams.some(function (s) { return /truehd|dts|mlp/i.test(s.codec_name || ''); });

    var rus = null;
    if (langs.some(function (l) { return l === 'rus' || l === 'ru'; })) rus = true;
    else if (tier || voices.length || RE_RUS.test(title)) rus = true;
    else if (streams.length && langs.every(function (l) { return l && l !== 'und'; })) rus = false;
    else if (RE_FOREIGN_ONLY.test(title)) rus = false;

    if (rus && !tier) { tier = 2; label = 'русская дорожка'; }

    return { rus: rus, tier: tier, label: label, heavy: heavy };
  }

  // which episodes a pack holds: "[49-96 из 175]", "1-328 серии из 328",
  // "[175 из 175]", "S01E05", plus the seasons it covers
  function coverageOf(element, title) {
    var from = 0;
    var to = 0;
    var m;

    if ((m = title.match(/(\d{1,4})\s*-\s*(\d{1,4})\s*(?:серии|серий|эпизод\S*)?\s*из\s*(\d{1,4}|x+|\?+)/i))) {
      from = +m[1]; to = +m[2];
    } else if ((m = title.match(/[\[(](\d{1,4})\s*из\s*(\d{1,4})[\])\s]/i))) {
      from = 1; to = +m[1];
    } else if ((m = title.match(/(?:серии|серий|эпизоды)\s*:?\s*(\d{1,4})\s*-\s*(\d{1,4})/i))) {
      from = +m[1]; to = +m[2];
    } else if ((m = title.match(/s\d{1,2}e(\d{1,4})(?:\s*-\s*e?(\d{1,4}))?/i))) {
      from = +m[1]; to = m[2] ? +m[2] : +m[1];
    }

    var seasons = element.info && element.info.seasons && element.info.seasons.length ? element.info.seasons.slice() : null;

    if (!seasons) {
      if ((m = title.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*сезон/i)) || (m = title.match(/s(\d{1,2})\s*-\s*s?(\d{1,2})/i))) {
        seasons = [];
        for (var s = +m[1]; s <= +m[2]; s++) seasons.push(s);
      } else if ((m = title.match(/(\d{1,2})\s*сезон/i)) || (m = title.match(/сезон\S*\s*:?\s*(\d{1,2})/i)) ||
                 (m = title.match(/(?:^|[^a-z])s(\d{1,2})(?:[^0-9e]|$)/i)) || (m = title.match(/(?:тв|tv|тб)\s*-\s*(\d{1,2})/i))) {
        seasons = [+m[1]];
      }
    }

    return { from: from, to: to, seasons: seasons };
  }

  // --- what the viewer needs -------------------------------------------------

  function isSerial(card) {
    return !!(card && (card.number_of_seasons || card.original_name || card.first_air_date));
  }

  function isAnime(card) {
    return !!(card && card.original_language === 'ja');
  }

  // continue.js keeps where each title was left; reuse it when present
  function neededEpisode(card) {
    if (!card || !card.id || !isSerial(card)) return null;
    var cache = Lampa.Storage.get('continue_episode', '{}');
    var saved = cache && cache[card.id];
    var found = saved && saved.found;
    if (!found || !found.episode) return null;

    var view = Lampa.Timeline.view(found.hash);
    var finished = view.percent >= CONFIG.nextThreshold;
    return { season: found.season, episode: finished ? found.episode + 1 : found.episode };
  }

  function mbitOf(element, card, coverage) {
    var size = sizeOf(element);
    if (!size || !card) return 0;

    var minutes;
    var parts = 1;

    if (isSerial(card)) {
      minutes = (card.episode_run_time && card.episode_run_time[0]) || (isAnime(card) ? CONFIG.runtimeAnime : CONFIG.runtimeSeries);
      if (!coverage.to) return 0;
      parts = coverage.to - coverage.from + 1;
    } else {
      minutes = card.runtime || CONFIG.runtimeFilm;
    }

    return size * 8 / (parts * minutes * 60) / 1000000;
  }

  // --- scoring ---------------------------------------------------------------

  function score(element, card, need, learned) {
    var title = text(element);
    var voices = voicesOf(element, title);
    var audio = audioOf(element, title, voices);
    var source = sourceOf(title);
    var res = resolutionOf(element, title, source);
    var coverage = coverageOf(element, title);
    var seeds = seedersOf(element);
    var mbit = mbitOf(element, card, coverage);

    var raw = 0;
    var tags = [];

    function tag(label, kind) { tags.push({ label: label, kind: kind || '' }); }

    // audio first: this is a Russian-speaking household
    if (audio.rus === true) raw += 25;
    else if (audio.rus === null) raw += 8;
    else { raw -= 30; tag('нет русского', 'warn'); }

    raw += [0, 3, 6, 9, 12][audio.tier];

    var voiceName = voices[0] || audio.label;
    if (voiceName) tag(voiceName + (voices[0] && audio.tier === 4 && !/дубляж/i.test(voices[0]) ? ' · дубляж' : ''));

    // picture for a Full HD screen
    raw += { 2160: -20, 1440: 12, 1080: 20, 720: 14, 480: 6 }[res] || 8;
    raw += source.score;
    tag((res ? res + 'p' : '') + (source.label ? (res ? ' ' : '') + source.label : '') || 'качество ?');

    if (element.info && element.info.videotype === 'hdr' || RE_HDR.test(title)) {
      raw -= 10;
      tag('HDR', 'warn');
    }

    // how heavy the stream is
    if (mbit) {
      var floor = CONFIG.minMbit[res] || 0.5;
      if (mbit > CONFIG.heavyMbit) { raw -= 12; tag('тяжёлый ' + Math.round(mbit) + ' Мбит/с', 'warn'); }
      else if (mbit > CONFIG.comfortMbit) raw -= 4;
      else if (mbit < floor) raw -= 4;
      else raw += 8;
    }

    if (audio.heavy) { raw -= 6; tag('TrueHD/DTS', 'warn'); }

    // the episode the viewer needs
    if (need) {
      var ranged = coverage.to > 0;
      var covers = ranged && need.episode >= coverage.from && need.episode <= coverage.to;
      var seasonKnown = coverage.seasons && coverage.seasons.length;
      var seasonFits = seasonKnown && coverage.seasons.indexOf(need.season) > -1;

      if (covers) { raw += 18; tag('есть ' + need.episode + '-я', 'good'); }
      else if (ranged) { raw -= 25; tag('нет ' + need.episode + '-й', 'warn'); }
      else if (seasonKnown && !seasonFits) { raw -= 15; tag('другой сезон', 'warn'); }
      else if (seasonFits) raw += 5;
    }

    // the voice-over picked before
    if (learned.card.length || learned.global.length) {
      var lower = voices.map(function (v) { return v.toLowerCase(); });
      if (audio.label) lower.push(audio.label);
      var mine = lower.some(function (v) { return learned.card.indexOf(v) > -1; });
      var usual = lower.some(function (v) { return learned.global.indexOf(v) > -1; });
      if (mine) { raw += 15; tag('как в прошлый раз', 'good'); }
      else if (usual) raw += 6;
    }

    if (element.viewed) raw += 10;

    raw += Math.min(20, 8 * Math.log(1 + seeds) / Math.LN10);
    tag(seeds + ' сид' + (seeds % 10 === 1 && seeds % 100 !== 11 ? '' : seeds % 10 >= 2 && seeds % 10 <= 4 && (seeds % 100 < 10 || seeds % 100 >= 20) ? 'а' : 'ов'));

    element.smart_score = Math.max(0, Math.min(100, Math.round(raw / 1.25)));
    element.smart_tags = tags;
    element.smart_voices = voices.concat(audio.label ? [audio.label] : []);
    element.smart_rus = audio.rus;
    return element.smart_score;
  }

  function learnedFor(card) {
    var data = memory();
    var own = (card && card.id && data.cards[card.id]) || [];
    var global = Object.keys(data.global)
      .sort(function (a, b) { return data.global[b] - data.global[a]; })
      .slice(0, 3);
    return { card: own, global: global };
  }

  function scoreAll(list, card) {
    var need = neededEpisode(card);
    var learned = learnedFor(card);
    list.forEach(function (element) { score(element, card, need, learned); });
  }

  function sortList(data) {
    var viewed = [];
    var rest = [];
    data.Results.forEach(function (element) { (element.viewed ? viewed : rest).push(element); });

    var by = function (a, b) { return (b.smart_score || 0) - (a.smart_score || 0) || seedersOf(b) - seedersOf(a); };
    viewed.sort(by);
    rest.sort(by);
    data.Results = viewed.concat(rest);
  }

  // --- filtering before the list is built ------------------------------------

  function keep(element) {
    var title = text(element);
    if (CONFIG.hide4K && RE_4K.test(title)) return false;
    if (CONFIG.hideCam && RE_CAM.test(title)) return false;
    if (CONFIG.minSeeders > 0 && seedersOf(element) < CONFIG.minSeeders) return false;
    if (!sizeOf(element)) return false;
    return true;
  }

  function dedupe(list) {
    var seen = {};
    var out = [];

    list.forEach(function (element) {
      var key = text(element).toLowerCase().replace(/\s+/g, ' ') + '|' + Math.round(sizeOf(element) / (256 * 1024 * 1024));
      var have = seen[key];
      if (!have) { seen[key] = element; out.push(element); }
      else if (seedersOf(element) > seedersOf(have)) { out[out.indexOf(have)] = element; seen[key] = element; }
    });

    return out;
  }

  var current = { data: null, card: null };

  // Every release list passes through Lampa.Parser.get before the torrents
  // component sees it, so filtering here keeps counters, filters and paging
  // consistent.
  function wrapParser() {
    var original = Lampa.Parser.get;

    Lampa.Parser.get = function (object, oncomplite, onerror) {
      original(object, function (data) {
        if (data && data.Results && data.Results.length) {
          var list = data.Results.filter(keep);
          if (CONFIG.dedupe) list = dedupe(list);
          if (CONFIG.hideNoRussian) {
            scoreAll(list, object && object.movie);
            var rus = list.filter(function (e) { return e.smart_rus !== false; });
            if (rus.length) list = rus;
          }
          // a short list beats no list
          if (list.length) data.Results = list;

          scoreAll(data.Results, object && object.movie);
          if (CONFIG.smartSort) sortList(data);

          current = { data: data, card: object && object.movie };
        }
        oncomplite(data);
      }, onerror);
    };
  }

  // The component re-sorts after it receives the list. It has no prototype
  // to patch, but its methods are own properties set in the constructor, so a
  // wrapper constructor can replace the default order after the original runs.
  function wrapComponent() {
    var Original = Lampa.Component.get('torrents');
    if (!Original) return;

    var Smart = function (object) {
      Original.call(this, object);

      var sortResults = this.sortResults;
      this.sortResults = function (need) {
        sortResults.call(this, need);
        if (CONFIG.smartSort && need === 'popular' && current.data) sortList(current.data);
      };
    };

    Lampa.Component.add('torrents', Smart);
  }

  // --- rows ------------------------------------------------------------------

  function drawRow(element, item) {
    if (!CONFIG.showScore || element.smart_score === undefined) return;

    var box = $('<div class="tsmart"></div>');
    var value = element.smart_score;
    var grade = value >= 70 ? 'good' : value >= 45 ? 'ok' : 'bad';

    box.append('<span class="tsmart__score tsmart__score--' + grade + '">' + value + '</span>');

    (element.smart_tags || []).slice(0, 6).forEach(function (t) {
      var node = $('<span></span>').text(t.label);
      if (t.kind) node.addClass('tsmart__' + t.kind);
      box.append(node);
    });

    item.find('.torrent-item__title').after(box);

    if (!CONFIG.markBest || value < CONFIG.bestMinScore) return;

    // the first row of a freshly built list is the best one after sorting;
    // the row is appended right after this event fires
    setTimeout(function () {
      if (item.index('.torrent-item') !== 0 && item.prevAll('.torrent-item').length) return;
      item.addClass('torrent-item--best');
      box.prepend('<span class="tsmart__best">лучший выбор</span>');
    }, 0);
  }

  function learn(element) {
    if (!CONFIG.learnVoices) return;
    var active = Lampa.Activity.active();
    var card = active && active.movie;
    var voices = (element.smart_voices || []).map(function (v) { return v.toLowerCase(); });
    if (!voices.length) return;

    var data = memory();
    if (card && card.id) {
      delete data.cards[card.id];
      data.cards[card.id] = voices;
    }
    voices.forEach(function (v) { data.global[v] = (data.global[v] || 0) + 1; });
    save(data);
  }

  function followRows() {
    Lampa.Listener.follow('torrent', function (event) {
      if (!event.element || !event.item) return;
      if (event.type === 'render') drawRow(event.element, event.item);
      if (event.type === 'onenter') learn(event.element);
    });
  }

  // --- file list inside a release ----------------------------------------------

  var files = [];
  var fileTimer = null;
  var auto = { timer: null, bar: null };

  function stopAuto() {
    clearInterval(auto.timer);
    auto.timer = null;
    if (auto.bar) auto.bar.remove();
    auto.bar = null;
    Lampa.Keypad.listener.remove('keydown', stopAuto);
  }

  function startAuto(item) {
    stopAuto();
    var started = Date.now();
    var total = CONFIG.autoPlaySeconds * 1000;

    auto.bar = $('<div class="torrent-serial__progress"></div>');
    item.prepend(auto.bar);

    auto.timer = setInterval(function () {
      var passed = Date.now() - started;
      if (auto.bar) auto.bar.css('height', Math.min(100, Math.round(passed / total * 100)) + '%');
      if (passed >= total) {
        stopAuto();
        item.trigger('hover:enter');
      }
    }, 50);

    Lampa.Keypad.listener.follow('keydown', stopAuto);
  }

  function pickFile(params) {
    if (files.length < 2) return;   // Lampa starts a single file on its own

    var last = null;
    files.forEach(function (file, index) {
      var view = file.element.timeline;
      if (view && view.updated && (!last || view.updated > last.view.updated)) last = { index: index, view: view };
    });

    var index = -1;
    var label = '';

    if (last) {
      var finished = last.view.percent >= CONFIG.nextThreshold;
      index = finished ? last.index + 1 : last.index;
      label = finished ? 'следующая' : 'здесь остановились';
    } else {
      var need = neededEpisode(params && params.movie);
      if (need) {
        files.forEach(function (file, i) {
          var el = file.element;
          if (index === -1 && +el.episode === need.episode && (!el.season || !need.season || +el.season === need.season)) index = i;
        });
        if (index === -1) {
          files.forEach(function (file, i) { if (index === -1 && +file.element.episode === need.episode) index = i; });
        }
        label = 'продолжить';
      }
    }

    if (index < 0 || index >= files.length) return;

    var target = files[index].item;
    var badge = '<span class="tsmart-resume">▶ ' + label + '</span>';
    var line = target.find('.torrent-serial__line').first();
    // titles are cut with an ellipsis, so the badge goes on the line below or in front
    if (line.length) line.prepend(badge);
    else target.find('.torrent-files__title, .torrent-file__title').first().prepend(badge);

    focusFile(target);
    // rows change height as their previews load, so settle the position once more
    setTimeout(function () { focusFile(target); }, 500);

    if (CONFIG.autoPlay) startAuto(target);
  }

  // A long list scrolls by transform, and rows stay hidden until the layer
  // code sees them on screen; move the scroll itself and refresh visibility.
  function focusFile(target) {
    try {
      var scroll = Lampa.Modal.scroll();
      Lampa.Controller.collectionFocus(target, scroll.render());
      // the animated scroll gets cut short on long lists, jump instead
      if (scroll.immediate) scroll.immediate(target, true);
      else scroll.update(target, true);
      Lampa.Layer.visible(scroll.render(true));
    } catch (e) {}
  }

  function followFiles() {
    Lampa.Listener.follow('torrent_file', function (event) {
      if (event.type === 'list_open') {
        files = [];
        stopAuto();
      } else if (event.type === 'render' && CONFIG.focusEpisode) {
        files.push({ item: event.item, element: event.element });
        clearTimeout(fileTimer);
        fileTimer = setTimeout(function () { pickFile(event.params); }, 80);
      } else if (event.type === 'list_close' || event.type === 'onenter') {
        stopAuto();
      }
    });
  }

  // --- start -------------------------------------------------------------------

  function start() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // the first version of this plugin switched the order to seeders
    if (!Lampa.Storage.get('torrents_smart_v2', false)) {
      if (Lampa.Storage.get('torrents_sort', 'popular') === 'Seeders') Lampa.Storage.set('torrents_sort', 'popular');
      Lampa.Storage.set('torrents_smart_v2', true);
    }

    wrapParser();
    wrapComponent();
    followRows();
    followFiles();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
