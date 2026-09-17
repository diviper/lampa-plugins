/*
 * continue.js — "Continue watching" row for Lampa
 *
 * Adds the viewing history as the first row of the home screen, regardless of
 * media type. Each card shows how far it was watched and which episode is
 * next, and selecting a card reopens the list it was last watched from —
 * online sources or torrents — and picks up at the right episode.
 *
 * Install: Settings → Extensions → Add plugin → https://diviper.github.io/lampa-plugins/continue.js
 */

(function () {
  'use strict';

  var CONFIG = {
    rowName: 'continue_all',        // storage key: content_rows_continue_all (Settings → Home rows)
    rowIndex: 0,                    // 0 = first row on the home screen
    maxItems: 19,                   // Lampa shows up to 20 cards per row
    hideBuiltInRow: true,           // the stock row only lists non-Japanese series

    showProgress: true,             // progress strip and episode badge on the cards
    maxSeasons: 10,                 // scan depth when the card does not report its season count
    maxEpisodes: 300,               // scan depth per season
    decorateTries: 20,              // attempts, 300 ms apart, to catch the row once it is drawn

    openLastMethod: true,           // OK on a card reopens the list it was last watched from
    autoPlayNext: true,             // and picks the episode to continue with
    nextThreshold: 90,              // percent above which the episode counts as finished
    autoPlayTimeout: 10000,         // ms to wait for the source list to render
    autoPlayPoll: 400,              // ms between attempts to find the episode row

    buttons: {                      // card page buttons per remembered method
      online: '.view--online_mod, .view--online',
      torrent: '.view--torrent'
    },
    openDelay: 500,                 // ms, lets other plugins attach their buttons first

    methodKey: 'continue_method',
    episodeKey: 'continue_episode',
    hashKey: 'continue_hash',
    historyLimit: 100
  };

  if (window.lampa_plugin_continue) return;
  window.lampa_plugin_continue = true;

  var pendingCardId = null;

  var css = [
    '.card__view{position:relative}',
    '.continue-line{position:absolute;left:0;right:0;bottom:0;z-index:2}',
    '.continue-badge{position:absolute;left:.4em;bottom:.5em;z-index:3;padding:.1em .45em;border-radius:.4em;',
    'background:rgba(0,0,0,.75);color:#fff;font-size:.9em;line-height:1.5}'
  ].join('');

  // --- small storage helpers -------------------------------------------------

  function store(key) {
    var data = Lampa.Storage.get(key, '{}');
    return data && typeof data === 'object' ? data : {};
  }

  function remember(key, id, value) {
    if (!id) return;
    var data = store(key);
    delete data[id];
    data[id] = value;

    var keys = Object.keys(data);
    while (keys.length > CONFIG.historyLimit) delete data[keys.shift()];

    Lampa.Storage.set(key, data);
  }

  // --- what was this title watched with --------------------------------------

  function methodFor(component) {
    if (component === 'torrents') return 'torrent';
    if (component && component.indexOf('online') === 0) return 'online';
    return null;
  }

  // --- where did watching stop ----------------------------------------------

  function fileView() {
    try {
      var data = Lampa.Storage.get(Lampa.Timeline.filename(), '{}');
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  }

  function stampOf(views) {
    var max = 0;
    for (var key in views) {
      var road = views[key];
      if (road && road.updated > max) max = road.updated;
    }
    return max;
  }

  function titlesOf(card) {
    var titles = [];
    if (card.original_title) titles.push(card.original_title);
    if (card.original_name && titles.indexOf(card.original_name) === -1) titles.push(card.original_name);
    return titles;
  }

  function isSerial(card) {
    return !!(card.number_of_seasons || card.original_name || card.first_air_date);
  }

  // Lampa keys watch positions by a hash of the title (plus season and episode
  // for series), so the only way back from a card to its position is to try the
  // combinations. The hash is a short loop over a string, this is cheap.
  function scan(card, views) {
    var titles = titlesOf(card);
    var best = null;

    if (!isSerial(card)) {
      for (var t = 0; t < titles.length; t++) {
        var movie = views[Lampa.Utils.hash(titles[t])];
        if (movie && (!best || movie.updated > best.updated)) {
          best = { season: 0, episode: 0, hash: Lampa.Utils.hash(titles[t]), updated: movie.updated || 0 };
        }
      }
      return best;
    }

    var seasons = card.number_of_seasons || CONFIG.maxSeasons;

    for (var i = 0; i < titles.length; i++) {
      for (var s = 1; s <= seasons; s++) {
        for (var e = 1; e <= CONFIG.maxEpisodes; e++) {
          var hash = Lampa.Utils.hash([s, s > 10 ? ':' : '', e, titles[i]].join(''));
          var road = views[hash];
          if (road && (!best || road.updated > best.updated)) {
            best = { season: s, episode: e, hash: hash, updated: road.updated || 0 };
          }
        }
      }
    }

    return best;
  }

  function positionOf(card) {
    if (!card || !card.id) return null;

    var views = fileView();
    var stamp = stampOf(views);
    var cache = store(CONFIG.episodeKey);
    var saved = cache[card.id];

    if (saved && saved.stamp === stamp) return saved.found || null;

    var found = scan(card, views);
    remember(CONFIG.episodeKey, card.id, { stamp: stamp, found: found });

    return found;
  }

  function hashOf(id) {
    var cache = store(CONFIG.episodeKey);
    var saved = cache[id];
    if (saved && saved.found && saved.found.hash) return saved.found.hash;
    return store(CONFIG.hashKey)[id] || null;
  }

  // --- the row ---------------------------------------------------------------

  function history() {
    var seen = Lampa.Favorite.get({ type: 'viewed' })
      .concat(Lampa.Favorite.get({ type: 'thrown' }))
      .map(function (card) { return card.id; });

    return Lampa.Favorite.get({ type: 'history' })
      .filter(function (card) { return seen.indexOf(card.id) === -1; })
      .slice(0, CONFIG.maxItems)
      .map(function (card) {
        var copy = Lampa.Arrays.clone(card);
        copy.continue_row = true;
        return copy;
      });
  }

  function decorateCard(node, card) {
    if (!card || node.find('.continue-badge, .continue-line').length) return;

    var position = positionOf(card);
    if (!position) return;

    var view = Lampa.Timeline.view(position.hash);
    var box = node.find('.card__view');
    if (!box.length) return;

    if (position.season) {
      box.append('<div class="continue-badge">S' + position.season + ' · E' + position.episode + '</div>');
    }

    if (view.percent) {
      var line = $('<div class="continue-line"></div>');
      line.append(Lampa.Timeline.render(view));
      box.append(line);
    }
  }

  // Lampa keeps the previous screen in the DOM while it builds the next one,
  // so always look inside the activity that is on screen right now.
  function findRow() {
    var active = Lampa.Activity.active();
    var root = active && active.activity ? active.activity.render() : $('body');
    var title = Lampa.Lang.translate('title_continue');
    var found = null;

    root.find('.items-line').each(function () {
      if (!found && $(this).find('.items-line__title').text().trim() === title) found = $(this);
    });

    return found;
  }

  function decorateRow(results) {
    if (!CONFIG.showProgress) return;

    var tries = 0;

    var timer = setInterval(function () {
      tries++;

      var line = findRow();
      var cards = line ? line.find('.card') : [];
      var ready = cards.length >= results.length;

      if (!cards.length && tries <= CONFIG.decorateTries) return;
      if (!ready && tries <= CONFIG.decorateTries) return;   // the row is still filling up

      clearInterval(timer);
      cards.each(function (index) { decorateCard($(this), results[index]); });
    }, 300);
  }

  function addRow() {
    Lampa.ContentRows.add({
      name: CONFIG.rowName,
      title: Lampa.Lang.translate('title_continue'),
      index: CONFIG.rowIndex,
      screen: ['main'],
      call: function () {
        var results = history();
        if (!results.length) return;

        return function (call) {
          call({ results: results, title: Lampa.Lang.translate('title_continue') });
          decorateRow(results);
        };
      }
    });
  }

  // --- opening the right list at the right episode ---------------------------

  function playEpisode(hash) {
    var started = Date.now();
    var component = Lampa.Activity.active().component;

    var timer = setInterval(function () {
      var active = Lampa.Activity.active().component;

      if (active !== component || Date.now() - started > CONFIG.autoPlayTimeout) return clearInterval(timer);

      var rows = $('.online');
      if (!rows.length) return;

      var index = -1;
      rows.each(function (i) {
        if ($(this).find('.time-line[data-hash="' + hash + '"]').length) index = i;
      });
      if (index === -1) return;

      clearInterval(timer);

      var target = rows.eq(index);
      var view = Lampa.Timeline.view(hash);

      if (view.percent >= CONFIG.nextThreshold && rows.length > index + 1) target = rows.eq(index + 1);

      target.trigger('hover:enter');
    }, CONFIG.autoPlayPoll);
  }

  function trackActivities() {
    Lampa.Listener.follow('activity', function (event) {
      if (event.type !== 'create' || !event.object) return;

      var object = event.object;
      var method = methodFor(event.component);

      if (method && object.movie && object.movie.id) remember(CONFIG.methodKey, object.movie.id, method);

      if (event.component === 'full' && object.card && object.card.continue_row) pendingCardId = object.id;
    });

    // the player knows the exact hash, so keep it for titles the scan misses
    Lampa.Player.listener.follow('start', function (data) {
      var active = Lampa.Activity.active();
      var card = active && active.movie;
      if (card && card.id && data && data.timeline && data.timeline.hash) remember(CONFIG.hashKey, card.id, data.timeline.hash);
    });

    Lampa.Listener.follow('full', function (event) {
      if (event.type !== 'complite' || !pendingCardId || !event.object || event.object.id !== pendingCardId) return;

      var id = pendingCardId;
      pendingCardId = null;

      var method = store(CONFIG.methodKey)[id];
      if (!method || !CONFIG.buttons[method]) return;

      setTimeout(function () {
        var button = event.object.activity.render().find(CONFIG.buttons[method]).first();
        if (!button.length) return;

        button.trigger('hover:enter');

        var hash = hashOf(id);
        if (method === 'online' && CONFIG.autoPlayNext && hash) setTimeout(function () { playEpisode(hash); }, 300);
      }, CONFIG.openDelay);
    });
  }

  // Account plugins can arrive after the home screen is already drawn;
  // rebuild it once so the row shows up on the first start too.
  function redrawHome() {
    var active = Lampa.Activity.active();
    if (active && active.component === 'main') Lampa.Activity.replace({});
  }

  function start() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    if (CONFIG.hideBuiltInRow) Lampa.Storage.set('content_rows_continue_watch', false);
    addRow();
    if (CONFIG.openLastMethod) trackActivities();
    redrawHome();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
