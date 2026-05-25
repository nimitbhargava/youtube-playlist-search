# Changelog

All notable changes to the **YouTube Playlist Search** Chrome extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] — 2026-05-25

### Fixed
- Clearing the search field now restores all items. Previously, structural mode's `getItems()` filtered out elements failing `isVisible()`, so items we had hidden with `display:none` became invisible to subsequent reads and stayed hidden forever.

### Changed
- Search field spacing tightened and balanced: container padding `8px 16px 4px` → `4px 8px 12px`, field padding `8px 12px` → `10px 14px`, gap `8px` → `10px`, border-radius `18px` → `20px`. Field now aligns horizontally with the items below it.

## [1.0.3] — 2026-05-25

### Fixed
- Popup no longer closes when clicking the search input. `mousedown`, `pointerdown`, `click`, `focusin`, and `touchstart` are now stopped at the search container so YouTube's iron-dropdown outside-click handler ignores them.
- Empty-search state correctly shows all items. The structural list detector now prefers semantic item selectors (`yt-lockup-view-model`, `[role="option"]`, etc.) before falling back to the homogeneous-children heuristic, which previously could pick the wrong container and visually swallow the playlist items.
- Input text is no longer dim. Dropped the color-mirroring path in the adaptive theme — it was probing the first available text node, which often had a secondary color. The CSS variable defaults (`--yt-spec-text-primary`) already pick the correct color per theme.

### Changed
- Inject log now reports which selector pattern matched (e.g. `yt-lockup-view-model` vs `(homogeneous)`), so misfires are easier to spot.

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
