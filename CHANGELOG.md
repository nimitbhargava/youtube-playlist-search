# Changelog

All notable changes to the **YouTube Playlist Search** Chrome extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.19] - 2026-06-05

### Fixed
- The "Search your playlists" field no longer leaks onto YouTube's generic three-dot action menu (Add to queue / Save to Watch later / Save to playlist / Download / Share / Report). Two causes, both fixed. (1) The structural popup detector read the first short text found anywhere in a popup as its title, so the action menu's own "Save to Watch later" and "Save to playlist" rows could satisfy the "save to" gate. This fired when those rows mounted before "Add to queue" (an incremental-mount race that leaves the field pinned to the top of the finished menu) or on menu surfaces that have no "Add to queue" row first. The gate now finds the row list first and requires a matching title that sits OUTSIDE that list, which a real Save-to dialog has and an action menu (whose only "Save to ..." texts are rows) does not. (2) Nothing ever removed an injected field, so a field placed correctly in a real Save-to popup was stranded when YouTube reused the same dropdown element for another menu. A new teardown pass (`pruneStalePopupSearch`) removes any popup search field whose host popup is no longer the Save-to dialog (closed, hidden, or reused). It keeps the field while you filter the list down to zero matches by re-checking the durable Save-to title instead of the live row count, so an empty result set never tears the search away. Reproduced and verified in a headless-Chrome harness across action-menu, redesigned-popup, reuse, and filter-to-zero scenarios.

## [1.0.18] - 2026-06-01

### Added
- New-playlist title prefill in the Save-to dialog. Type a query, get no match, and click YouTube's "New playlist" button: the native create dialog now opens with your query already in the title field (selected, so one keystroke replaces it or one click on Create accepts it), and the Create button is enabled immediately. The query is captured the moment the create control is clicked, since the save-to popup can be torn down as the create dialog opens. We never click Create for you. Works across desktop, mobile, and Music via structural dialog detection (header phrase "New playlist" / "Create playlist", with a Create-button fallback for redesigned markup); the title field is set through the native value setter plus dispatched `input`/`change` events so YouTube's data binding registers it.
- Hardening on the prefill path (from an adversarial code review): the click capture only runs inside a popup and ignores selectable playlist rows, so a playlist a user happened to name "New playlist ..." is never mistaken for the create button; the armed query clears on navigation; the create-control matcher also recognizes "Create new playlist"; and the next-frame re-assert only refills when the field is still empty and focused, so it never fights a user who is already typing.

### Fixed
- Double scrollbar in the Save-to popup when the window is constrained (e.g. fullscreen). The search field was inserted as a sibling above the playlist list; when the list is its own scroll container, that added height to a height-bounded parent, so the parent scrolled (outer bar) while the list still scrolled (inner bar). Now `placeSearchUI` detects when the list owns the Y-overflow and injects the search inside it as the sticky first child, leaving a single scroll container. Placement is decided from the declared `overflow-y` (not live `scrollHeight`) so it is correct regardless of whether all rows have mounted yet, and only when the list stacks its children vertically (a row/grid scroller falls back to the old sibling placement so the search never lands in a single cell).

## [1.0.17] - 2026-05-27

### Changed
- 128 px icon now uses ~16 px of transparent padding on every side so the artwork sits in a centred 96×96 area. Matches Chrome Web Store thumbnail guidance, so the store-listing thumbnail no longer fills edge to edge. 16/32/48 toolbar icons stay full-bleed (no padding) so they remain readable at small sizes.
- Manifest `description` rewritten to be benefit-led and to name all three surfaces the extension touches (Save-to dialog, library, Music) plus the zero-permissions differentiator. Was: "Adds a real-time search to YouTube's Save to playlist dialog. Matches native YouTube design and adapts to UI changes." Now: "Real-time search for your YouTube playlists in the Save-to dialog, library, and Music. Native look. Zero permissions." Still under the 132-char store limit. Becomes the short summary shown under the extension name in store search.

## [1.0.16] — 2026-05-26

### Fixed
- Typed text is white again. `mimicChipStyle` was copying the chip wrapper's computed `color` (often `black` — the visible chip text gets re-coloured to white by an inner descendant via cascade), turning typed input black. Drop the color copy entirely. The CSS default (`--yt-spec-text-primary`) is already correct.
- Improved chip-element detection: also defer the style mirror to the next animation frame so the chip's own styles have fully resolved when we read them.

## [1.0.15] — 2026-05-26

### Changed
- Page search now mimics a real chip's computed styles at inject time: height, border-radius, background, border color/style/width, font size/weight/color are all copied from the first chip inside the chip cloud. This locks the search appearance to whatever sizing YouTube uses for chips, instead of guessing pixel values that drift as YouTube updates.
- Container width: `max-width: 320px` → `width: 240px`. The search no longer dominates the chip row.

## [1.0.14] — 2026-05-26

### Fixed
- Modal search container is opaque again. After 1.0.7 made it transparent to avoid a color-mismatch strip, the sticky search field stopped covering items that scrolled beneath it — playlists were visible through the field. Restore JS-side background mirroring, but with a smarter algorithm: check the popup element's own background first, then BFS *downward* to find a sizeable opaque descendant. This avoids the earlier bug where walking *upward* from a transparent popup wrapper overshot into the page background. CSS fallback chain runs through `--yt-spec-menu-background` → `--yt-spec-general-background-a` → `#1f1f1f` if the JS path finds nothing.

## [1.0.13] — 2026-05-26

### Changed
- Page search aligns with the chip row: bump field height `36px → 40px` (was a few pixels shorter than the chips, leaving it visibly off-center), add `align-self: center` on the search container, and add `box-sizing: border-box` so the border doesn't inflate the height past 40 px.

## [1.0.12] — 2026-05-26

### Changed
- Page search field shape now matches the other filter chips in the row: pill-shaped (`border-radius: 999px`) and 36 px tall instead of 32 px / 8 px-rounded rectangle.

## [1.0.11] — 2026-05-26

### Changed
- Page search now sits at the **start** of the chip row, ahead of all filter chips, instead of at the end.

## [1.0.10] — 2026-05-26

### Changed
- Playlists-feed search no longer adds a wide vertical gap. `escapeCellularLayout` now runs only when the structural-grid fallback was used. When the chip cloud was found, the search stays in the chip row's parent so it can sit next to the chips (in the same flex row) instead of being pushed up into a grandparent block. Added `flex-shrink: 0` and dropped the bottom padding so the search doesn't push the chip row down.

## [1.0.9] — 2026-05-26

### Changed
- Playlists-feed search now matches YouTube's chip-row visual weight: 32 px tall, 320 px max-width, 8 px border-radius (was a 40 px-tall 480 px pill). Background and border use `--yt-spec-badge-chip-background` / `--yt-spec-10-percent-layer` so the field reads as a sibling of the filter chips rather than a header-style search bar.

## [1.0.8] — 2026-05-26

### Fixed
- Search field on `/feed/playlists` no longer lands inside the grid as a stray cell next to the first card. Two changes: (a) `findChipCloud()` now also picks up `role="tablist"` and inferred tablists (parents of multiple `role="tab"` siblings), so the search inserts immediately after the chip row; (b) `escapeCellularLayout()` runs on every insert point and walks the parent chain past any grid/flex layout, landing the search at a block-level row above the grid.

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
