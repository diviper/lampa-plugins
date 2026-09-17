/*
 * trailers.js — "Trailers" section for Lampa
 *
 * Adds a menu entry with fresh lists from TMDB (now playing, upcoming,
 * popular, trending, series on air). Opening a title from these lists goes
 * straight to its trailer picker; with "Trailer player = YouTube" on Android
 * the trailer opens in the YouTube app (SmartTube on the TV).
 *
 * Install: Settings → Extensions → Add plugin → https://diviper.github.io/lampa-plugins/trailers.js
 */

(function () {
  'use strict';

  var CONFIG = {
    menuTitle: 'Трейлеры',
    autoOpenTrailer: true,   // open the trailer picker as soon as the card loads
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
  window.lampa_plugin_trailers = true;

  var trailerMode = false;

  var icon = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="2" y="5" width="20" height="14" rx="2.5" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>';

  function openList(item) {
    trailerMode = true;
    Lampa.Activity.push({
      url: item.url,
      title: item.title,
      component: 'category_full',
      source: 'tmdb',
      card_type: true,
      page: 1
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
    item.on('hover:enter', showMenu);
    $('.menu .menu__list').eq(0).append(item);
  }

  function trackActivities() {
    Lampa.Listener.follow('activity', function (event) {
      if (event.type !== 'create') return;
      // leaving the section resets the mode
      if (event.component === 'main' || event.component === 'category') trailerMode = false;
    });

    Lampa.Listener.follow('full', function (event) {
      if (event.type !== 'complite' || !trailerMode || !CONFIG.autoOpenTrailer) return;
      setTimeout(function () {
        var button = event.object.activity.render().find('.view--trailer');
        if (button.length) button.trigger('hover:enter');
      }, CONFIG.openDelay);
    });
  }

  function start() {
    addMenuItem();
    trackActivities();
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
