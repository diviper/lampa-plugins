/*
 * cards.js — cleaner title page for Lampa
 * Version 1.1.0
 *
 * Puts the backdrop behind the title page at full width with a soft fade,
 * enlarges the poster and the title, and rounds the action buttons.
 * Pure CSS plus one image per card; smaller image on TVs, and a gradient
 * fallback where the web view has no mask support.
 *
 * Settings: Lampa → Settings → My plugins.
 * Install: Settings → Extensions → Add plugin → https://diviper.github.io/lampa-plugins/cards.js
 */

(function () {
  'use strict';

  var VERSION = '1.1.0';

  var CONFIG = {
    backdrop: true,          // show the backdrop image behind the title block
    backdropOpacity: 0.55,
    titleScale: 1.3,         // multiplier for the title font size
    roundButtons: true
  };

  if (window.lampa_plugin_cards) return;
  window.lampa_plugin_cards = VERSION;

  // --- shared bits: settings section, guarded handlers -----------------------

  var SETTINGS = 'dvp';
  var ICON = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function safe(fn, where) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { console.error('[dvp cards] ' + (where || ''), e); }
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
    CONFIG.backdrop = opt('cards_backdrop', CONFIG.backdrop);
  }

  function registerSettings() {
    settingsSection();
    heading('Карточка ' + VERSION);
    option('cards_backdrop', true, 'Кадр из фильма за описанием', 'Выключить, если телевизору тяжело');
    Lampa.Storage.listener.follow('change', safe(function (event) {
      if (event.name && event.name.indexOf('dvp_cards_') === 0) applySettings();
    }, 'settings'));
  }

  function isTv() {
    try { return Lampa.Platform.is('android') || Lampa.Platform.screen('tv'); }
    catch (e) { return false; }
  }

  function masksSupported() {
    try {
      return !!(window.CSS && CSS.supports && (CSS.supports('mask-image', 'linear-gradient(black, transparent)') || CSS.supports('-webkit-mask-image', 'linear-gradient(black, transparent)')));
    } catch (e) { return false; }
  }

  var mask = masksSupported();

  var css = [
    '.full-start-new{position:relative}',
    '.cards-backdrop{position:absolute;top:-4em;right:-3em;bottom:-2em;left:35%;z-index:-1;background-size:cover;background-position:center;',
    'opacity:' + CONFIG.backdropOpacity + ';border-radius:1em;',
    mask
      ? '-webkit-mask-image:linear-gradient(to right,transparent 0,#000 35%,#000 100%),linear-gradient(to top,transparent 0,#000 30%);mask-image:linear-gradient(to right,transparent 0,#000 35%,#000 100%),linear-gradient(to top,transparent 0,#000 30%);-webkit-mask-composite:source-in;mask-composite:intersect}'
      : '}.cards-backdrop:after{content:"";position:absolute;top:0;right:0;bottom:0;left:0;background:linear-gradient(to right,rgba(0,0,0,.95) 0,rgba(0,0,0,0) 45%),linear-gradient(to top,rgba(0,0,0,.95) 0,rgba(0,0,0,0) 40%)}',
    '.full-start-new__title{font-size:' + (3.2 * CONFIG.titleScale).toFixed(2) + 'em;line-height:1.05;text-shadow:0 2px 12px rgba(0,0,0,.6)}',
    '.full-start-new__poster{border-radius:.9em;box-shadow:0 1em 2.5em rgba(0,0,0,.5)}',
    '.full-start-new__tagline{opacity:.8}',
    CONFIG.roundButtons ? '.full-start__button{border-radius:2em;background:rgba(255,255,255,.08)}.full-start__button.focus{background:#fff;color:#000}' : ''
  ].join('');

  function backdrop(event) {
    if (!CONFIG.backdrop) return;
    var movie = event.data && event.data.movie;
    if (!movie || !movie.backdrop_path) return;

    var root = event.object.activity.render().find('.full-start-new');
    if (!root.length || root.find('.cards-backdrop').length) return;

    var layer = document.createElement('div');
    layer.className = 'cards-backdrop';
    layer.style.backgroundImage = 'url(' + Lampa.Api.img(movie.backdrop_path, isTv() ? 'w780' : 'w1280') + ')';
    root.prepend(layer);
  }

  var start = safe(function () {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    registerSettings();
    applySettings();

    Lampa.Listener.follow('full', safe(function (event) {
      if (event.type === 'complite') backdrop(event);
    }, 'full'));

    console.log('[dvp] cards ' + VERSION + (mask ? '' : ' (no mask support, gradient fallback)'));
  }, 'start');

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
