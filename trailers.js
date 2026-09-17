/*
 * trailers.js — "Trailers" section for Lampa
 * Version 1.1.0
 *
 * Adds a menu entry with fresh lists from TMDB (now playing, upcoming,
 * popular, trending, series on air) and a "Now in cinemas" row on the home
 * screen. Opening a title from these lists goes straight to its trailer
 * picker; with "Trailer player = YouTube" on Android the trailer opens in
 * the YouTube app (SmartTube on the TV). Cards opened from anywhere else
 * behave as usual.
 *
 * Settings: Lampa → Settings → My plugins.
 * Install: Settings → Extensions → Add plugin → https://diviper.github.io/lampa-plugins/trailers.js
 */

(function () {
  'use strict';

  var VERSION = '1.1.0';

  var CONFIG = {
    menuTitle: 'Трейлеры',
    autoOpenTrailer: true,   // open the trailer picker as soon as the card loads
    homeRow: true,           // "Now in cinemas" row on the home screen
    homeRowIndex: 2,
    openDelay: 600,
    lists: [
      { title: 'В кино сейчас', url: 'movie/now_playing' },
      { title: 'Скоро в кино', url: 'movie/upcoming' },
      { title: 'Популярные фильмы', url: 'movie/popular' },
      { title: 'В тренде за неделю', url: 'trending/movie/week' },
      { title: 'Сериалы в эфире', url: 'tv/on_the_air' },
      { title: 'Популярные сериалы', url: 'tv/popular' }
    ]
  };

  if (window.lampa_plugin_trailers) return;
  window.lampa_plugin_trailers = VERSION;

  // --- shared bits: settings section, guarded handlers -----------------------

  var SETTINGS = 'dvp';
  var ICON = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function safe(fn, where) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { console.error('[dvp trailers] ' + (where || ''), e); }
    };
  }

  function settingsSection() {
    if (window.dvp_settings) return;
    window.dvp_settings = true;
    Lampa.SettingsApi.addComponent({ component: SETTINGS, icon: ICON, name: 'Мои плагины' });
  }

  function heading(name) {
    Lampa.SettingsApi.addParam({ component: SETTINGS, param: { name: 'dvp_head_' + name, type: 'title' }, field: { name: name } });
  }

  function option(key, def, name, description, values) {
    Lampa.SettingsApi.addParam({
      component: SETTINGS,
      param: { name: 'dvp_' + key, type: values ? 'select' : 'trigger', values: values, default: def },
      field: { name: name, description: description }
    });
  }

  function opt(key, def) {
    var value = Lampa.Storage.get('dvp_' + key, def);
    return value === '' ? def : value;
  }

  function applySettings() {
    CONFIG.autoOpenTrailer = opt('trailers_auto', CONFIG.autoOpenTrailer);
    CONFIG.homeRow = opt('trailers_row', CONFIG.homeRow);
  }

  function registerSettings() {
    settingsSection();
    heading('Трейлеры ' + VERSION);
    option('trailers_auto', true, 'Сразу открывать трейлер', 'Для карточек из списков «Трейлеры» и строки «В кино сейчас»');
    option('trailers_row', true, 'Строка «В кино сейчас» на главной', 'Вступает в силу после перезапуска');
    Lampa.Storage.listener.follow('change', safe(function (event) {
      if (event.name && event.name.indexOf('dvp_trailers_') === 0) applySettings();
    }, 'settings'));
  }

  var pendingCardId = null;

  var icon = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="2" y="5" width="20" height="14" rx="2.5" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>';

  function openList(item) {
    Lampa.Activity.push({
      url: item.url,
      title: item.title,
      component: 'category_full',
      source: 'tmdb',
      card_type: true,
      page: 1,
      trailers_list: true          // marks this screen so cards opened from it get the trailer treatment
    });
  }

  function showMenu() {
    Lampa.Select.show({
      title: CONFIG.menuTitle,
      items: CONFIG.lists.map(function (item) { return { title: item.title, list: item }; }),
      onBack: function () { Lampa.Controller.toggle('menu'); },
      onSelect: function (selected) { openList(selected.list); }
    });
  }

  function addMenuItem() {
    var item = $('<li class="menu__item selector"><div class="menu__ico">' + icon + '</div><div class="menu__text">' + CONFIG.menuTitle + '</div></li>');
    item.on('hover:enter', safe(showMenu, 'menu'));
    $('.menu .menu__list').eq(0).append(item);
  }

  function addHomeRow() {
    Lampa.ContentRows.add({
      name: 'trailers_now',
      title: CONFIG.lists[0].title,
      index: CONFIG.homeRowIndex,
      screen: ['main'],
      call: function () {
        return function (call) {
          Lampa.Api.sources.tmdb.get('movie/now_playing', {}, function (json) {
            var results = (json && json.results || []).slice(0, 20).map(function (card) {
              card.source = 'tmdb';
              card.trailers_card = true;
              return card;
            });
            call({ results: results, title: CONFIG.lists[0].title });
          }, function () { call({ results: [], title: CONFIG.lists[0].title }); });
        };
      }
    });
  }

  // The trailer treatment applies to one card: the one opened straight from
  // our list or our row. Anything opened afterwards behaves normally.
  // At 'create' time the new screen is not in the stack yet, so the screen it
  // was opened from is the last stack entry that is not the new one.
  function cameFromUs(object) {
    if (object.card && object.card.trailers_card) return true;
    try {
      var stack = Lampa.Activity.all();
      for (var i = stack.length - 1; i >= 0; i--) {
        var entry = stack[i];
        if (entry === object || (entry.activity && entry.activity === object.activity)) continue;
        return !!entry.trailers_list;
      }
    } catch (e) {}
    return false;
  }

  function trackActivities() {
    Lampa.Listener.follow('activity', safe(function (event) {
      if (event.type !== 'create' || !event.object) return;
      pendingCardId = event.component === 'full' && cameFromUs(event.object) ? event.object.id : null;
    }, 'activity'));

    Lampa.Listener.follow('full', safe(function (event) {
      if (event.type !== 'complite' || !CONFIG.autoOpenTrailer || !pendingCardId || !event.object || event.object.id !== pendingCardId) return;
      pendingCardId = null;
      setTimeout(function () {
        var button = event.object.activity.render().find('.view--trailer');
        if (button.length) button.trigger('hover:enter');
      }, CONFIG.openDelay);
    }, 'full'));
  }

  var start = safe(function () {
    registerSettings();
    applySettings();

    addMenuItem();
    if (CONFIG.homeRow) addHomeRow();
    trackActivities();

    console.log('[dvp] trailers ' + VERSION);
  }, 'start');

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
