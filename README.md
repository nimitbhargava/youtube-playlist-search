# YouTube Playlist Search

A Chrome extension that adds a real-time search field wherever YouTube shows a list of your playlists:

- The **Save to playlist** popup (under a video, search results, library, etc.)
- The **Playlists** library page at `youtube.com/feed/playlists`
- **YouTube Music**'s add-to-playlist dialog

The injected field mirrors YouTube's typography, spacing, and theme by reading computed styles from sibling elements, so it keeps blending in even as YouTube updates its design system. Detection uses layered selector fallbacks (semantic tag → ID → ARIA role → structural heuristic), so it keeps working when the markup changes.

## Repo layout

```
extension/   Chrome extension (MV3). Load this folder unpacked in chrome://extensions.
web/         Landing page (static HTML/CSS). Deploy anywhere — Vercel, GitHub Pages, etc.
```

## Install the extension

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and pick the `extension/` folder.

That's it — refresh any YouTube tab.

A Chrome Web Store listing is in progress.

## Use

- Open Save to playlist on any video → start typing → the playlist list filters live. The **New playlist** option always stays visible.
- Visit `youtube.com/feed/playlists` → a search field appears above the filter chips. Type to filter your library.
- `Esc` clears the field. The × icon clears too.

## Run the landing page locally

```bash
cd web
python3 -m http.server 4000
# open http://localhost:4000
```

Or any static server. The page has no build step — edit `web/index.html` and `web/styles.css` directly.

## Deploy the landing page

The `web/` folder is plain static HTML/CSS. To deploy on Vercel, set the project's **Root Directory** to `web` and leave framework/build settings empty.

```bash
cd web
vercel
```

## Develop the extension

Source is one ~10 KB content script. To iterate:

1. Edit `extension/src/content.js` or `extension/src/styles.css`.
2. Reload the extension at `chrome://extensions`.
3. Hard-refresh any YouTube tab.

Regenerate the toolbar icons if you change the pixel function:

```bash
node extension/scripts/make-icons.js
```

## How it adapts to YouTube redesigns

YouTube ships new markup often. The extension is built to absorb that:

- **Multiple selectors per element.** Known custom-element tags first (`ytd-add-to-playlist-renderer`, `ytd-rich-item-renderer`, etc.), then IDs, then ARIA roles, then a structural heuristic that finds any visible container holding a list of checkbox-like options.
- **Computed-style mirroring.** Colors, font family, and field background are read from real sibling elements at inject time, so the field blends in even when `--yt-spec-*` variables get renamed.
- **One global `MutationObserver`.** Watches the document and re-scans for matching containers as the DOM mutates. Hooks `yt-navigate-finish` for SPA navigation.

When a redesign breaks one selector, the fallback chain keeps the feature working until the specific selector can be added.

## Permissions

The extension declares **zero permissions** in `manifest.json`. It runs only on `youtube.com`, `m.youtube.com`, and `music.youtube.com`. It talks to no servers and stores nothing.

## Contributing

Issues and PRs welcome. Keep changes minimal and focused — the value of this extension is that it's small enough to read and trust in one sitting.

## License

MIT — see [`LICENSE`](./LICENSE).
