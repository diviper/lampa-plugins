# lampa-plugins

Plugins for [Lampa](https://github.com/yumata/lampa), served from GitHub Pages.

| Plugin | URL |
|---|---|
| Continue watching | `https://diviper.github.io/lampa-plugins/continue.js` |

Add the URL in Lampa: **Settings → Extensions → Add plugin**. With a CUB account, add it once at cub.best → profile → My plugins and every device picks it up on the next start.

## continue.js

The stock "Continue watching" row on the home screen only lists series that are not in Japanese; films and Japanese series show up on their own category screens. This plugin replaces it with one row that:

- shows the full viewing history (minus titles marked as watched or dropped) as the first row of the home screen;
- opens the online sources list directly when a card is selected, so the last voice-over and episode are one press away;
- keeps the stock row available: set `hideBuiltInRow: false` in `CONFIG`.

All knobs live in the `CONFIG` block at the top of the file (row position, item limit, source button selector, delay).

## Development

- Files are plain ES5 so they run in old TV web views.
- Lampa caches plugin files; after a change, restart Lampa or bump the URL (`continue.js?v=2`).
- GitHub Pages serves `application/javascript`, which Lampa's script loader requires. Gist raw URLs are served as `text/plain` with `nosniff` and will not load.

## License

MIT
