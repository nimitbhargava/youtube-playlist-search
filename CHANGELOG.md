# Changelog

All notable changes to the **YouTube Playlist Search** Chrome extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.7] — 2026-05-26

### Fixed
- Clear button (×) now actually clears the search. The previous version stopped propagation in the *capture* phase on the search container, which short-circuited the button's own click handler before it could fire. Stop propagation in the bubble phase only — events still reach descendants normally, and YouTube's outside-click handler is still blocked on the way up.
- Removed the dark-gray strip around the search field. Container is now `background: transparent` so YouTube's popup chrome shows through directly. The pill input still has its own background and stays visually distinct.

### Added
- Structural fallback for the `/feed/playlists` search: if the explicit container/insert-point selectors fail, walk the visible `ytd-browse` for any element with multiple homogeneous, visible, text-bearing children and insert above it. Survives renamed grid wrappers without needing per-version selector updates.
- `window.__ytps_debug_page()` console helper. Returns explicit + structural detection results for the playlists feed page — paste the output if the search still doesn't appear.

## [1.0.6] — 2026-05-25

### Fixed
- Sticky search background now matches the popup chrome. Dropped the JS-side `findOpaqueBackground` walk-up, which sometimes overshot the transparent popup wrapper and adopted the page background. CSS now cascades through `--yt-spec-menu-background` → `--yt-spec-general-background-a` → `--yt-spec-base-background` → a darker hardcoded fallback (`#1f1f1f`).
- Search field appears reliably on `youtube.com/feed/playlists`. The container and chip-cloud detectors now try several alternate tag names (`ytd-section-list-renderer`, `yt-section-list-view-model`, `yt-chip-cloud-view-model`, `ytd-feed-filter-chip-bar-renderer`) before falling back to the page root, so a renamed YouTube wrapper no longer suppresses injection.

### Added
- 500 ms safety-net poll that re-runs modal and page scans. The MutationObserver catches most popup mounts, but YouTube occasionally batches DOM updates behind attribute toggles or re-renders the popup body after my initial inject. The poll keeps the search field reliable without measurable CPU cost.

## [1.0.5] — 2026-05-25

### Added
- Search field is now sticky at the top of the popup. Scrolling through a long playlist list keeps the field visible so the user can refine or clear their search without scrolling back up. The page-level search on `/feed/playlists` stays static (not in a scroll container).
- Adaptive theme now mirrors the popup's actual background color (walking up the ancestor chain until a non-transparent background is found), so the sticky field blends in regardless of YouTube's CSS-variable naming.

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
