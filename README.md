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
- remembers whether a title was last opened from online sources or torrents, reopens that list when the card is selected, and continues from there: for online sources it clicks the episode, for torrents it opens the release you watched before (Lampa marks it as viewed), where `torrents-sort.js` takes over;
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

Lampa orders releases by seeders. On Russian trackers that can put a 790 GB Blu-ray remux with English-only audio above a 1080p dub that plays fine on a TV. This plugin scores every release from 0 to 100 and sorts by the score. The score adds up:

- **Russian audio**, read from the ffprobe data the tracker provides and from the title, including tracker shorthand (ДБ, ЛД, ЛМ, ЛО, MVO, DVO, AVO). Dub ranks above multi-voice, multi-voice above single voice. Releases with no Russian track sink but stay in the list unless `hideNoRussian` is on.
- **Picture for a Full HD screen**: 1080p first, 4K hidden, HDR marked down, WEB-DL and BDRip above TV rips.
- **Weight of the stream**: size is divided by episodes and runtime, so a remux at 26 Mbit/s per episode is flagged before it stalls over Wi-Fi. TrueHD and DTS tracks are flagged too.
- **The episode you need**: with `continue.js` installed, packs that contain the episode you stopped at move up and packs that do not move down (`[49-96 из 175]`, `1-328 серии из 328`, `S01E05` and similar).
- **Your voice-over**: the release you open is remembered per title and overall, and matching releases get a boost next time.
- **Seeders**, on a log scale, so a few extra do not outweigh everything else.

Every row shows the score and the reasons, and the top row is marked as the best pick. Dead releases, CAM rips, zero-size entries and duplicates across trackers are dropped before the list is built. If filtering would leave nothing, the original list is shown.

Inside a release, the file list jumps to the episode you stopped at (or the next one if you finished it), marks it, and starts it after a short countdown. Any key cancels the countdown.

How it hooks in: results are filtered and scored in a wrapper around `Lampa.Parser.get`; the torrents component is wrapped so the default "popular" order is replaced by the score; rows are decorated through the `torrent` render event; the file list through `torrent_file` events. Everything tunable is in `CONFIG`.

## Development

- Files are plain ES5 so they run in old TV web views.
- Lampa caches plugin files; after a change, restart Lampa or bump the URL (`continue.js?v=2`).
- GitHub Pages serves `application/javascript`, which Lampa's script loader requires. Gist raw URLs are served as `text/plain` with `nosniff` and will not load.

## License

MIT
