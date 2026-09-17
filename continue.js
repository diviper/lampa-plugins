(function () {
  'use strict';
  // «Продолжить просмотр» для всех типов (аниме, сериалы, фильмы) первой строкой на главной.
  // OK по карточке сразу открывает список источников/серий (кнопка «Онлайн» online_mod).
  if (window.plugin_continue_all_ready) return;
  window.plugin_continue_all_ready = true;

  var pending = null;

  function items() {
    var hist = Lampa.Favorite.get({ type: 'history' });
    var skip = Lampa.Favorite.get({ type: 'viewed' }).concat(Lampa.Favorite.get({ type: 'thrown' }));
    return hist
      .filter(function (c) { return !skip.find(function (v) { return v.id == c.id; }); })
      .slice(0, 19)
      .map(function (c) {
        var k = Lampa.Arrays.clone(c);
        k.__continue_all = true;
        return k;
      });
  }

  function start() {
    // встроенная строка показывает только неяпонские сериалы, чтобы не дублировалась - выключаем
    Lampa.Storage.set('content_rows_continue_watch', false);

    Lampa.ContentRows.add({
      name: 'continue_all',
      title: Lampa.Lang.translate('title_continue'),
      index: 0,
      screen: ['main'],
      call: function () {
        var results = items();
        if (!results.length) return;
        return function (call) {
          call({ results: results, title: Lampa.Lang.translate('title_continue') });
        };
      }
    });

    Lampa.Listener.follow('activity', function (e) {
      if (e.type == 'create' && e.component == 'full' && e.object && e.object.card && e.object.card.__continue_all) {
        pending = e.object.id;
      }
    });

    Lampa.Listener.follow('full', function (e) {
      if (e.type == 'complite' && pending && e.object && e.object.id == pending) {
        pending = null;
        setTimeout(function () {
          var btn = e.object.activity.render().find('.view--online_mod');
          if (btn.length) btn.trigger('hover:enter');
        }, 500);
      }
    });
  }

  if (window.appready) start();
  else Lampa.Listener.follow('app', function (e) { if (e.type == 'ready') start(); });
})();
