# Changelog

All notable changes to the **YouTube Playlist Search** Chrome extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] — 2026-05-25

### Fixed
- Detect "Save to…" popups when YouTube mounts the body (`yt-sheet-view-model`) into a pre-existing `tp-yt-iron-dropdown` wrapper. The MutationObserver now triggers a debounced full-document modal scan on any DOM change instead of only scanning freshly-added nodes, so popups inserted into long-lived wrappers no longer get missed.
- Added `yt-sheet-view-model` to the popup-detection selector set.

## [1.0.1] — 2026-05-25

### Fixed
- Detect YouTube's redesigned "Save to…" popup that no longer uses `ytd-add-to-playlist-renderer`. A tag-name-independent fallback now matches any visible popup whose header starts with "Save to…", "Save video to…", or "Add to playlist…", and locates the playlist list by structural inference.

### Added
- `window.__ytps_debug()` console helper for diagnosing future markup changes (logs visible popups, header matches, inferred list/item tags).

## [1.0.0] — 2026-05-25

### Added
- Real-time search field injected into YouTube's Save-to-playlist popup. Auto-focuses on open, `Esc` clears, the "New playlist" option always stays visible.
- Page-level search on `youtube.com/feed/playlists` inserted above the filter chips.
- YouTube Music's add-to-playlist dialog supported alongside the main site.
- Native-looking field styling that mirrors YouTube's typography, spacing, and theme by reading computed styles at inject time.
- Layered selector fallbacks (semantic tag → ID → ARIA role → structural heuristic) for resilience to YouTube redesigns.
- SPA navigation hooks via `yt-navigate-finish` / `yt-navigate-start` so the page search appears and disappears with route changes.
