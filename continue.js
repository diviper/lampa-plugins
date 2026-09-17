/*
 * continue.js — "Continue watching" row for Lampa
 *
 * Adds the viewing history as the first row of the home screen, regardless of
 * media type, and opens the online sources list straight from the card so a
 * show can be resumed in two presses instead of five.
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
    openSourcesOnSelect: true,      // OK on a card opens the online sources list
    sourceButton: '.view--online_mod',
    openDelay: 500                  // ms, lets other plugins attach their buttons first
  };

  if (window.lampa_plugin_continue) return;
  window.lampa_plugin_continue = true;

  var pendingCardId = null;

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

  function openSources() {
    Lampa.Listener.follow('activity', function (event) {
      var object = event.object;

      if (event.type === 'create' && event.component === 'full' && object && object.card && object.card.continue_row) {
        pendingCardId = object.id;
      }
    });

    Lampa.Listener.follow('full', function (event) {
      if (event.type !== 'complite' || !pendingCardId || !event.object || event.object.id !== pendingCardId) return;

      pendingCardId = null;

      setTimeout(function () {
        var button = event.object.activity.render().find(CONFIG.sourceButton);
        if (button.length) button.trigger('hover:enter');
      }, CONFIG.openDelay);
    });
  }

  function start() {
    if (CONFIG.hideBuiltInRow) Lampa.Storage.set('content_rows_continue_watch', false);
    addRow();
    if (CONFIG.openSourcesOnSelect) openSources();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
