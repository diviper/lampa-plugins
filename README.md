# lampa-plugins

Plugins for [Lampa](https://github.com/yumata/lampa), served from GitHub Pages.

| Plugin | URL |
|---|---|
| Continue watching | `https://diviper.github.io/lampa-plugins/continue.js` |
| Stream stats | `https://diviper.github.io/lampa-plugins/stream-stats.js` |
| Cards | `https://diviper.github.io/lampa-plugins/cards.js` |
| Trailers | `https://diviper.github.io/lampa-plugins/trailers.js` |

Add the URL in Lampa: **Settings → Extensions → Add plugin**. With a CUB account, add it once at cub.best → profile → My plugins and every device picks it up on the next start.

## continue.js

The stock "Continue watching" row on the home screen only lists series that are not in Japanese; films and Japanese series show up on their own category screens. This plugin replaces it with one row that:

- shows the full viewing history (minus titles marked as watched or dropped) as the first row of the home screen;
- remembers whether a title was last opened from online sources or torrents and reopens that list when the card is selected; unknown titles open the regular card page;
- keeps the stock row available: set `hideBuiltInRow: false` in `CONFIG`.

All knobs live in the `CONFIG` block at the top of the file (row position, item limit, source button selector, delay).

## stream-stats.js

An overlay in the built-in player that explains stutter: resolution, seconds buffered ahead, buffer inflow relative to playback (below 1x the source is slower than the video), dropped frames, and for TorrServe streams the download speed, peers and seeders. External players (VLC, MX) are not covered; they have their own statistics screens.

## cards.js

Title page styling: the backdrop sits behind the text block with a soft fade, the poster and title are larger, the buttons are rounded. One image per card, nothing else.

## trailers.js

A "Trailers" menu entry with TMDB lists (now playing, upcoming, popular, trending, series on air). Opening a title from these lists jumps straight to its trailer picker. On Android with Settings → Player → Trailer player = YouTube the trailer opens in the YouTube app.

## Development

- Files are plain ES5 so they run in old TV web views.
- Lampa caches plugin files; after a change, restart Lampa or bump the URL (`continue.js?v=2`).
- GitHub Pages serves `application/javascript`, which Lampa's script loader requires. Gist raw URLs are served as `text/plain` with `nosniff` and will not load.

## License

MIT
