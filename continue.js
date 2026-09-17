/*
 * continue.js — "Continue watching" row for Lampa
 *
 * Adds the viewing history as the first row of the home screen, regardless of
 * media type, and remembers how each title was last watched (online sources or
 * torrents) so that selecting a card jumps straight to that list.
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
    openLastMethod: true,           // OK on a card reopens the list it was last watched from
    methodStorageKey: 'continue_method',
    methodHistoryLimit: 100,
    buttons: {                      // card page buttons per remembered method
      online: '.view--online_mod, .view--online',
      torrent: '.view--torrent'
    },
    openDelay: 500                  // ms, lets other plugins attach their buttons first
  };

  if (window.lampa_plugin_continue) return;
  window.lampa_plugin_continue = true;

  var pendingCardId = null;

  function methods() {
    var data = Lampa.Storage.get(CONFIG.methodStorageKey, '{}');
    return typeof data === 'object' && data ? data : {};
  }

  function rememberMethod(id, method) {
    if (!id) return;
    var data = methods();
    delete data[id];
    data[id] = method;

    var keys = Object.keys(data);
    while (keys.length > CONFIG.methodHistoryLimit) delete data[keys.shift()];

    Lampa.Storage.set(CONFIG.methodStorageKey, data);
  }

  function methodFor(component) {
    if (component === 'torrents') return 'torrent';
    if (component && component.indexOf('online') === 0) return 'online';
    return null;
  }

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
        };
      }
    });
  }

  function trackActivities() {
    Lampa.Listener.follow('activity', function (event) {
      if (event.type !== 'create' || !event.object) return;

      var object = event.object;
      var method = methodFor(event.component);

      if (method && object.movie && object.movie.id) rememberMethod(object.movie.id, method);

      if (event.component === 'full' && object.card && object.card.continue_row) pendingCardId = object.id;
    });

    Lampa.Listener.follow('full', function (event) {
      if (event.type !== 'complite' || !pendingCardId || !event.object || event.object.id !== pendingCardId) return;

      var id = pendingCardId;
      pendingCardId = null;

      var method = methods()[id];
      if (!method || !CONFIG.buttons[method]) return;

      setTimeout(function () {
        var button = event.object.activity.render().find(CONFIG.buttons[method]).first();
        if (button.length) button.trigger('hover:enter');
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
    if (CONFIG.hideBuiltInRow) Lampa.Storage.set('content_rows_continue_watch', false);
    addRow();
    if (CONFIG.openLastMethod) trackActivities();
    redrawHome();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
