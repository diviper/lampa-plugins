# lampa-plugins

Plugins for [Lampa](https://github.com/yumata/lampa), served from GitHub Pages.

| Plugin | URL |
|---|---|
| Continue watching | `https://diviper.github.io/lampa-plugins/continue.js` |
| Stream stats | `https://diviper.github.io/lampa-plugins/stream-stats.js` |
| Cards | `https://diviper.github.io/lampa-plugins/cards.js` |
| Trailers | `https://diviper.github.io/lampa-plugins/trailers.js` |
| Torrent list | `https://diviper.github.io/lampa-plugins/torrents-sort.js` |

Add the URL in Lampa: **Settings → Extensions → Add plugin**. With a CUB account, add it once at cub.best → profile → My plugins and every device picks it up on the next start.

## continue.js

The stock "Continue watching" row on the home screen only lists series that are not in Japanese; films and Japanese series show up on their own category screens. This plugin replaces it with one row that:

- shows the full viewing history (minus titles marked as watched or dropped) as the first row of the home screen;
- puts the watched position and the episode number on each card;
- remembers whether a title was last opened from online sources or torrents, reopens that list when the card is selected, and clicks the episode to continue with;
- keeps the stock row available: set `hideBuiltInRow: false` in `CONFIG`.

Lampa keys watch positions by a hash of the title, season and episode, with no index back to the card, so the plugin tries the combinations for each card and caches the answer until the positions change. A scan of six cards takes about 7 ms. Depth is bounded by `maxSeasons` and `maxEpisodes`; a title watched beyond that is still found once it is played again, because the player reports the exact hash.

Auto-continue only fires when the episode row can be identified by its hash, waits at most `autoPlayTimeout`, and gives up silently if you navigate away. Turn it off with `autoPlayNext: false`.

## stream-stats.js

An overlay in the built-in player that explains stutter: resolution, seconds buffered ahead, buffer inflow relative to playback (below 1x the source is slower than the video), dropped frames, and for TorrServe streams the download speed, peers and seeders.

When inflow stays below 1x for `warnAfterSeconds` with a buffer under `warnBufferSeconds`, it also says so in a notification instead of leaving you to guess. Set `warn: false` to keep only the numbers.

External players (VLC, MX) are not covered; they have their own statistics screens.

## cards.js

Title page styling: the backdrop sits behind the text block with a soft fade, the poster and title are larger, the buttons are rounded. One image per card, nothing else.

## trailers.js

A "Trailers" menu entry with TMDB lists (now playing, upcoming, popular, trending, series on air). Opening a title from these lists jumps straight to its trailer picker. On Android with Settings → Player → Trailer player = YouTube the trailer opens in the YouTube app.

## torrents-sort.js

A shorter torrent list. Drops 4K releases a Full HD TV cannot play, dead releases with no seeders and broken zero-size entries, keeps Lampa's own sort set to seeders, and marks Full HD releases of a sensible size as the safe pick. Filtering happens in a wrapper around `Lampa.Parser.get`, before the list component sees the results, so counters, filters and paging stay consistent. If every release is filtered out, the unfiltered list is shown instead.

## Development

- Files are plain ES5 so they run in old TV web views.
- Lampa caches plugin files; after a change, restart Lampa or bump the URL (`continue.js?v=2`).
- GitHub Pages serves `application/javascript`, which Lampa's script loader requires. Gist raw URLs are served as `text/plain` with `nosniff` and will not load.

## License

MIT
