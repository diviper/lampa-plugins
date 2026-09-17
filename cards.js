/*
 * cards.js — cleaner title page for Lampa
 *
 * Puts the backdrop behind the title page at full width with a soft fade,
 * enlarges the poster and the title, and rounds the action buttons.
 * Pure CSS plus one image per card; no extra requests beyond the backdrop
 * Lampa already knows.
 *
 * Install: Settings → Extensions → Add plugin → https://diviper.github.io/lampa-plugins/cards.js
 */

(function () {
  'use strict';

  var CONFIG = {
    backdrop: true,          // show the backdrop image behind the title block
    backdropSize: 'w1280',   // TMDB size: w780 for weaker TVs
    backdropOpacity: 0.55,
    titleScale: 1.3,         // multiplier for the title font size
    roundButtons: true
  };

  if (window.lampa_plugin_cards) return;
  window.lampa_plugin_cards = true;

  var css = [
    '.full-start-new{position:relative}',
    '.cards-backdrop{position:absolute;top:-4em;right:-3em;bottom:-2em;left:35%;z-index:-1;background-size:cover;background-position:center;',
    'opacity:' + CONFIG.backdropOpacity + ';border-radius:1em;',
    '-webkit-mask-image:linear-gradient(to right,transparent 0,#000 35%,#000 100%),linear-gradient(to top,transparent 0,#000 30%);',
    'mask-image:linear-gradient(to right,transparent 0,#000 35%,#000 100%),linear-gradient(to top,transparent 0,#000 30%);',
    '-webkit-mask-composite:source-in;mask-composite:intersect}',
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
    layer.style.backgroundImage = 'url(' + Lampa.Api.img(movie.backdrop_path, CONFIG.backdropSize) + ')';
    root.prepend(layer);
  }

  function start() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    Lampa.Listener.follow('full', function (event) {
      if (event.type === 'complite') backdrop(event);
    });
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
