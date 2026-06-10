(() => {
  'use strict';

  const CONTAINER_CLASS = 'ytps-search-container';
  const INPUT_CLASS = 'ytps-input';
  const HIDDEN_CLASS = 'ytps-hidden';
  const PAGE_MARKER_ATTR = 'data-ytps-page';
  const STRUCTURAL_MARKER_ATTR = 'data-ytps-structural';

  // --- Modal strategies: the "Save to playlist" popup --------------------
  // These match the old YouTube design. When YouTube ships new markup, the
  // structural detector below takes over — it doesn't need explicit selectors.
  const MODAL_STRATEGIES = [
    {
      modal: 'ytd-add-to-playlist-renderer',
      list: '#playlists',
      item: 'ytd-playlist-add-to-option-renderer',
      label: '#label',
    },
    {
      modal: 'ytmusic-add-to-playlist-renderer',
      list: '#playlists, [id="playlists"]',
      item: 'ytmusic-playlist-add-to-option-renderer',
      label: '#label, yt-formatted-string',
    },
  ];

  // Header phrases YouTube uses for the playlist popup. The structural
  // detector matches any visible popup whose top text starts with one of
  // these — works regardless of the custom element tag name.
  const HEADER_PHRASES = [
    'save to',
    'save video to',
    'save to playlist',
    'add to playlist',
    'add video to playlist',
  ];

  // Header phrases for YouTube's "New playlist" creation dialog. When the user
  // triggers create from our search with a query typed, we pre-fill the title
  // field with that query so they don't retype what they just searched for.
  const CREATE_HEADER_PHRASES = [
    'new playlist',
    'create playlist',
    'create new playlist',
    'name your playlist',
  ];

  // --- Page strategies: full pages with playlist grids -------------------
  const PAGE_STRATEGIES = [
    {
      name: 'feed-playlists',
      placeholder: 'Search your playlists',
      matches: () => /^\/feed\/playlists\/?$/.test(location.pathname),
      findContainer: () => {
        // Try known container tags in order. YouTube renames these over time.
        const candidates = [
          'ytd-browse[page-subtype="playlists"]:not([hidden]) ytd-rich-grid-renderer',
          'ytd-browse[page-subtype="playlists"]:not([hidden]) ytd-section-list-renderer',
          'ytd-browse[page-subtype="playlists"]:not([hidden]) yt-section-list-view-model',
          'ytd-browse:not([hidden]) ytd-rich-grid-renderer',
          'ytd-browse:not([hidden]) ytd-section-list-renderer',
          'ytd-browse[page-subtype="playlists"]:not([hidden])',
        ];
        for (const sel of candidates) {
          const el = qs(sel);
          if (el) return el;
        }
        return null;
      },
      findInsertPoint: () => {
        const chips = findChipCloud();
        if (chips?.parentElement) {
          // Insert BEFORE the chip cloud so the search lands at the start of
          // the chip row, ahead of all filter chips.
          return {
            parent: chips.parentElement,
            before: chips,
          };
        }
        // Fall back to start of grid contents.
        const grid =
          qs('ytd-browse:not([hidden]) ytd-rich-grid-renderer') ||
          qs('ytd-browse:not([hidden]) ytd-section-list-renderer');
        if (grid) {
          const contents = grid.querySelector('#contents') || grid;
          return { parent: contents, before: contents.firstChild };
        }
        return null;
      },
      findItems: (container) =>
        Array.from(
          container.querySelectorAll(
            'ytd-rich-item-renderer, ytd-playlist-renderer, yt-lockup-view-model'
          )
        ),
      getLabel: (item) => getPageLabel(item),
    },
  ];

  // --- DOM helpers --------------------------------------------------------
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Does this element scroll its own overflow on the Y axis? We test the
  // declared overflow (not the live scrollHeight) so the answer is the same
  // whether the list has finished loading items or not. This matters because we
  // decide search placement at inject time, before all rows may have mounted.
  function isScrollableY(el) {
    if (!el) return false;
    const oy = getComputedStyle(el).overflowY;
    return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
  }

  // True when the element stacks its children vertically (block, flow-root,
  // table, list-item, or a column flexbox). A row flexbox or a grid would lay a
  // block child out as a single cell beside the first item, which is wrong for
  // our full-width sticky header, so we only adopt first-child insertion when
  // this is true.
  function isVerticalFlow(el) {
    const cs = getComputedStyle(el);
    const d = cs.display;
    if (d === 'flex' || d === 'inline-flex') {
      const dir = cs.flexDirection || 'row';
      return dir === 'column' || dir === 'column-reverse';
    }
    if (d === 'grid' || d === 'inline-grid') return false;
    return true;
  }

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getModalLabel(item, labelSelector) {
    if (labelSelector) {
      const el = item.querySelector(labelSelector);
      const text = el && (el.getAttribute('title') || el.textContent || '').trim();
      if (text) return text;
    }
    return getStructuralLabel(item);
  }

  function getStructuralLabel(item) {
    // Try common label-bearing elements first.
    const candidates = [
      item.querySelector('#label'),
      item.querySelector('#video-title'),
      item.querySelector('yt-formatted-string[title]'),
      item.querySelector('yt-formatted-string'),
      item.querySelector('[id*="title" i]'),
      item.querySelector('[class*="title" i]'),
      item.querySelector('h3'),
      item.querySelector('h4'),
    ].filter(Boolean);
    for (const c of candidates) {
      const text = (c.getAttribute('title') || c.textContent || '').trim();
      if (text && text.length < 200) return text.split('\n')[0].trim();
    }
    // Fallback: first non-empty text line of the item.
    const text = (item.textContent || '').trim();
    return text.split('\n').map((s) => s.trim()).find((s) => s.length > 0) || '';
  }

  function getPageLabel(item) {
    const candidates = [
      item.querySelector('#video-title'),
      item.querySelector('.yt-lockup-metadata-view-model-wiz__title span'),
      item.querySelector('.yt-lockup-metadata-view-model-wiz__title'),
      item.querySelector('h3 a'),
      item.querySelector('a[title]'),
      item.querySelector('yt-formatted-string[title]'),
      item.querySelector('yt-formatted-string'),
      item.querySelector('h3'),
    ].filter(Boolean);
    for (const c of candidates) {
      const t = (c.getAttribute('title') || c.textContent || '').trim();
      if (t) return t;
    }
    return (item.textContent || '').trim();
  }

  function isCreatePlaylistItem(item) {
    if (!item) return false;
    if (item.id && /create|new/i.test(item.id)) return true;
    if (item.matches?.('#create-playlist-button, [id*="create" i]')) return true;
    const txt = normalize(item.textContent || '');
    // Matches "New playlist", "Create playlist", and "Create new playlist".
    return /^(\+\s*)?(new\s+playlist|create(\s+new)?\s+playlist)/.test(txt);
  }

  // --- Structural modal detection (tag-name-independent) -----------------
  // Find any visible popup whose top text matches a known header phrase.
  // Then locate its list of items by structural inference.
  const POPUP_SELECTOR =
    'tp-yt-paper-dialog, ytd-popup-container, ytd-menu-popup-renderer, ' +
    'tp-yt-iron-dropdown, yt-sheet-view-model, ' +
    '[role="dialog"], [role="menu"], [role="listbox"]';

  function findStructuralModal(root = document) {
    const popups = root.querySelectorAll
      ? Array.from(root.querySelectorAll(POPUP_SELECTOR))
      : [];
    if (root.matches && root.matches(POPUP_SELECTOR)) popups.unshift(root);

    for (const popup of popups) {
      if (!isVisible(popup)) continue;
      if (popup.querySelector(`.${CONTAINER_CLASS}`)) continue;

      // Find the row list first, then require a matching title that lives
      // OUTSIDE it. Order matters: a generic action menu's "Save to ..." rows
      // would otherwise be read as the title and the box would leak onto it.
      const listInfo = findListInPopup(popup);
      if (!listInfo) continue;

      const header = getPopupHeader(popup, listInfo.list);
      const headerNorm = normalize(header);
      if (!HEADER_PHRASES.some((p) => headerNorm.startsWith(p))) continue;

      return { popup, header, ...listInfo };
    }
    return null;
  }

  // Read the popup's title. When `excludeList` is given, skip any candidate
  // inside (or wrapping) that row list: a generic action menu has rows literally
  // titled "Save to Watch later" / "Save to playlist", and reading one of those
  // as the popup title is exactly what leaked the search box onto the three-dot
  // menu. A real Save-to dialog's title sits OUTSIDE its row list, so excluding
  // the list keeps the genuine title while rejecting menu rows.
  function getPopupHeader(popup, excludeList) {
    const inList = (el) =>
      excludeList &&
      (el === excludeList || excludeList.contains(el) || el.contains(excludeList));

    // Heuristic: the first short text node near the top of the popup.
    const headingCandidates = popup.querySelectorAll(
      'h1, h2, h3, h4, [role="heading"], yt-formatted-string, span, div'
    );
    for (const el of headingCandidates) {
      if (inList(el)) continue;
      if (!isVisible(el)) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      if (text.length > 80) continue;
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
      if (lines.length !== 1) continue;
      return lines[0];
    }
    // Skip the whole-popup text fallback when a list was excluded: that
    // fallback would read the excluded rows back in and reintroduce the false
    // match. A popup with no heading outside its list is not a Save-to dialog.
    if (excludeList) return '';
    // Fallback: first line of the popup's text.
    const all = (popup.textContent || '').trim().split('\n').map((s) => s.trim()).filter(Boolean);
    return all[0] || '';
  }

  // Item patterns we recognize as a playlist row. Most-specific first.
  const ITEM_PATTERNS = [
    'ytd-playlist-add-to-option-renderer',
    'ytmusic-playlist-add-to-option-renderer',
    'yt-lockup-view-model',
    'yt-list-item-view-model',
    '[role="menuitemcheckbox"]',
    '[role="option"]',
    '[role="menuitem"]',
  ];

  // Find the element inside `popup` that holds the list of playlist rows.
  // Strategy: try semantic item patterns first (more reliable). Only fall back
  // to the homogeneous-children heuristic if nothing semantic matched.
  function findListInPopup(popup) {
    for (const pattern of ITEM_PATTERNS) {
      const items = Array.from(popup.querySelectorAll(pattern)).filter(isVisible);
      if (items.length < 2) continue;
      const byParent = new Map();
      for (const item of items) {
        const p = item.parentElement;
        if (!p) continue;
        if (!byParent.has(p)) byParent.set(p, []);
        byParent.get(p).push(item);
      }
      let bestList = null;
      let bestCount = 0;
      for (const [parent, kids] of byParent) {
        if (kids.length > bestCount) {
          bestList = parent;
          bestCount = kids.length;
        }
      }
      if (bestList && bestCount >= 2) {
        return { list: bestList, items: byParent.get(bestList), pattern };
      }
    }
    return findHomogeneousList(popup);
  }

  // Fallback: pick the element with the most homogeneous, visible, text-bearing
  // children. Less reliable — items risk picking up unrelated containers.
  function findHomogeneousList(popup) {
    const all = popup.querySelectorAll('*');
    let best = null;
    let bestScore = 0;

    for (const el of all) {
      const children = Array.from(el.children);
      if (children.length < 2) continue;

      const validChildren = children.filter((c) => {
        if (!isVisible(c)) return false;
        const txt = (c.textContent || '').trim();
        return txt.length > 0 && txt.length < 300;
      });
      if (validChildren.length < 2) continue;

      const tagSet = new Set(validChildren.map((c) => c.tagName));
      if (tagSet.size > 2) continue;

      const score = validChildren.length * (tagSet.size === 1 ? 2 : 1);
      if (score > bestScore) {
        best = { list: el, items: validChildren, pattern: '(homogeneous)' };
        bestScore = score;
      }
    }
    return best;
  }

  // --- UI builders --------------------------------------------------------
  function escapeAttr(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  function buildSearchUI(placeholder, emptyText) {
    const p = escapeAttr(placeholder);
    const e = escapeAttr(emptyText);
    const wrap = document.createElement('div');
    wrap.className = CONTAINER_CLASS;
    wrap.setAttribute('role', 'search');
    wrap.innerHTML = `
      <div class="ytps-field">
        <svg class="ytps-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.87 20.17l-5.59-5.59A6.97 6.97 0 0 0 17 10c0-3.87-3.13-7-7-7s-7 3.13-7 7 3.13 7 7 7c1.75 0 3.35-.65 4.58-1.71l5.59 5.59 1.7-1.71zM10 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"></path>
        </svg>
        <input
          class="${INPUT_CLASS}"
          type="text"
          placeholder="${p}"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="${p}"
        />
        <button class="ytps-clear" type="button" aria-label="Clear search" tabindex="-1">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
          </svg>
        </button>
      </div>
      <div class="ytps-empty" hidden>${e}</div>
    `;
    return wrap;
  }

  // Mirror the popup's chrome background onto the search container so the
  // sticky search field is opaque (covers items scrolling beneath it) and
  // matches the popup color exactly (no gray-strip mismatch).
  // Strategy: check the popup itself first; if it's transparent, walk DOWN
  // looking for a sizeable opaque descendant. Avoids the earlier bug where
  // walking UP overshot into the page background.
  function applyAdaptiveTheme(searchUI, scope) {
    try {
      const heading = scope.querySelector(
        'h1, h2, h3, [role="heading"], yt-formatted-string'
      );
      const cs = heading ? getComputedStyle(heading) : null;
      if (cs?.fontFamily) searchUI.style.setProperty('--ytps-font', cs.fontFamily);

      const bg = findPopupChromeColor(scope);
      if (bg) searchUI.style.setProperty('--ytps-bg', bg);
    } catch {
      // Fall back to CSS defaults.
    }
  }

  // Find the *visible chip pill* inside a chip-cloud wrapper. Many YouTube
  // chip designs put the styled pill on an inner button/element, not on the
  // ytd-*-renderer wrapper itself, so we look for the deepest descendant
  // that has both rounded corners and a non-transparent background.
  function findVisibleChip(chipCloud) {
    const candidates = chipCloud.querySelectorAll(
      'yt-chip-cloud-chip-renderer button, ' +
        'yt-chip-cloud-chip-view-model button, ' +
        'yt-chip-cloud-chip-renderer, yt-chip-cloud-chip-view-model, ' +
        'tp-yt-paper-tab, button, [role="tab"], *'
    );
    for (const c of candidates) {
      if (!isVisible(c)) continue;
      const cs = getComputedStyle(c);
      const rounded = parseFloat(cs.borderTopLeftRadius) > 0;
      const opaque =
        cs.backgroundColor &&
        cs.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        cs.backgroundColor !== 'transparent';
      if (rounded && opaque) return c;
    }
    return null;
  }

  // Copy a single chip's computed styles onto the search field so the
  // sizing/chrome match exactly, regardless of YouTube's current chip
  // dimensions or theme. Deferred to the next frame so the chip's own
  // styles have fully resolved when we read them.
  function mimicChipStyle(searchUI, chipCloud) {
    requestAnimationFrame(() => {
      const chip = findVisibleChip(chipCloud);
      if (!chip) return;

      const field = searchUI.querySelector('.ytps-field');
      if (!field) return;

      const cs = getComputedStyle(chip);
      const rect = chip.getBoundingClientRect();
      if (rect.height > 0) field.style.height = `${rect.height}px`;
      // Use the top-left radius and apply uniformly — chips are always symmetric.
      if (cs.borderTopLeftRadius) {
        field.style.borderRadius = cs.borderTopLeftRadius;
      }
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        field.style.background = cs.backgroundColor;
      }
      if (cs.borderColor) field.style.borderColor = cs.borderColor;
      if (cs.borderStyle) field.style.borderStyle = cs.borderStyle;
      if (cs.borderTopWidth) field.style.borderWidth = cs.borderTopWidth;

      // Don't mimic color — the chip wrapper's computed color is often black
      // (the visible text gets re-set to white by an inner element via the
      // cascade). The CSS default (--yt-spec-text-primary) is already right.
      const input = searchUI.querySelector('.ytps-input');
      if (input) {
        if (cs.fontSize) input.style.fontSize = cs.fontSize;
        if (cs.fontWeight) input.style.fontWeight = cs.fontWeight;
      }
    });
  }

  function findPopupChromeColor(popup) {
    const isOpaque = (s) =>
      s && s !== 'rgba(0, 0, 0, 0)' && s !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(s);

    // The popup itself.
    const popupCs = getComputedStyle(popup);
    if (isOpaque(popupCs.backgroundColor)) return popupCs.backgroundColor;

    // BFS descendants, prefer wide elements close to the popup root.
    const queue = [{ el: popup, depth: 0 }];
    while (queue.length) {
      const { el, depth } = queue.shift();
      if (depth > 4) continue;
      if (el !== popup) {
        const cs = getComputedStyle(el);
        if (isOpaque(cs.backgroundColor)) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 200 && rect.height >= 60) {
            return cs.backgroundColor;
          }
        }
      }
      for (const child of el.children) {
        queue.push({ el: child, depth: depth + 1 });
      }
    }
    return null;
  }

  function attachFilter(searchUI, ctx, opts = {}) {
    const input = searchUI.querySelector(`.${INPUT_CLASS}`);
    const clearBtn = searchUI.querySelector('.ytps-clear');
    const emptyState = searchUI.querySelector('.ytps-empty');

    // YouTube's iron-dropdown closes on outside clicks/focus. Stop those events
    // at the search container so the popup stays open when the user types.
    // Bubble phase only — capture-phase stop would short-circuit the clear
    // button before its own click handler can run.
    const stop = (e) => e.stopPropagation();
    for (const evt of ['mousedown', 'pointerdown', 'click', 'focusin', 'touchstart']) {
      searchUI.addEventListener(evt, stop);
    }

    const applyFilter = () => {
      const q = normalize(input.value);
      searchUI.classList.toggle('has-value', input.value.length > 0);
      const items = ctx.getItems();
      let visible = 0;
      for (const item of items) {
        if (ctx.isAlwaysVisible?.(item)) {
          item.classList.remove(HIDDEN_CLASS);
          continue;
        }
        const label = normalize(ctx.getLabel(item));
        const match = !q || label.includes(q);
        item.classList.toggle(HIDDEN_CLASS, !match);
        if (match) visible++;
      }
      emptyState.hidden = q.length === 0 || visible > 0;
    };

    input.addEventListener('input', applyFilter);

    const swallow = (e) => e.stopPropagation();
    input.addEventListener('keydown', (e) => {
      swallow(e);
      if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        input.value = '';
        applyFilter();
      }
    });
    input.addEventListener('keypress', swallow);
    input.addEventListener('keyup', swallow);

    clearBtn.addEventListener('click', () => {
      input.value = '';
      applyFilter();
      input.focus();
    });

    if (opts.autoFocus) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (input.isConnected && isVisible(input)) input.focus();
        }, 50);
      });
    }

    if (ctx.observeNode) {
      const obs = new MutationObserver(() => {
        if (input.value) applyFilter();
      });
      obs.observe(ctx.observeNode, { childList: true, subtree: true });
    }
  }

  // --- Injectors ----------------------------------------------------------
  // Place the search field so it shares ONE scroll container with the list.
  // If the list is itself the scroller, the search must go INSIDE it as the
  // sticky first child. Inserting it as a sibling above would add height to a
  // height-bounded parent, producing a second (outer) scrollbar that shows up
  // when the popup is constrained (e.g. fullscreen). Otherwise the parent is
  // the scroller, so inserting before the list keeps the search inside it.
  // Returns the element the items live in (unchanged) for the caller's ctx.
  function placeSearchUI(searchUI, list) {
    // Adopt the inside-as-sticky-first-child layout only when the list is its
    // own scroller AND stacks children vertically. A row/grid scroller would
    // render our block container as one cell beside the first item, so fall
    // back to the sibling-above placement there.
    if (isScrollableY(list) && isVerticalFlow(list)) {
      list.insertBefore(searchUI, list.firstChild);
    } else {
      list.parentElement?.insertBefore(searchUI, list);
    }
  }

  function injectIntoModal(modal, strategy) {
    if (!modal || !modal.isConnected) return;
    if (modal.querySelector(`.${CONTAINER_CLASS}`)) return;

    const list =
      strategy.list && typeof strategy.list === 'string'
        ? modal.querySelector(strategy.list)
        : strategy.list;
    if (!list) return;

    const searchUI = buildSearchUI('Search your playlists', 'No matching playlists');
    placeSearchUI(searchUI, list);
    applyAdaptiveTheme(searchUI, modal);

    console.info('[ytps] modal search injected via', modal.tagName.toLowerCase());

    attachFilter(
      searchUI,
      {
        getItems: () => Array.from(list.querySelectorAll(strategy.item)),
        getLabel: (item) => getModalLabel(item, strategy.label),
        isAlwaysVisible: isCreatePlaylistItem,
        observeNode: list,
      },
      { autoFocus: true }
    );
  }

  function injectIntoStructural({ popup, list, items, header, pattern }) {
    if (popup.querySelector(`.${CONTAINER_CLASS}`)) return;

    // Re-query items so the filter operates on the same selector that found them,
    // not just on `list.children` (the items may not be direct children).
    const itemSelector =
      pattern && pattern !== '(homogeneous)' ? pattern : null;

    const searchUI = buildSearchUI('Search your playlists', 'No matching playlists');
    searchUI.setAttribute(STRUCTURAL_MARKER_ATTR, '');
    placeSearchUI(searchUI, list);
    applyAdaptiveTheme(searchUI, popup);

    console.info(
      '[ytps] structural inject — header:',
      JSON.stringify(header),
      '| popup:',
      popup.tagName.toLowerCase(),
      '| list:',
      list.tagName.toLowerCase(),
      '| pattern:',
      pattern,
      '| items:',
      items.length
    );

    attachFilter(
      searchUI,
      {
        // Do NOT filter by isVisible — items we've hidden ourselves would be
        // excluded from subsequent reads, so clearing the filter wouldn't
        // restore them. Exclude our own search container, which becomes a child
        // of the list when the list is the scroll container (see placeSearchUI).
        getItems: () =>
          itemSelector
            ? Array.from(list.querySelectorAll(itemSelector))
            : Array.from(list.children).filter(
                (c) => !c.classList.contains(CONTAINER_CLASS)
              ),
        getLabel: getStructuralLabel,
        isAlwaysVisible: isCreatePlaylistItem,
        observeNode: list,
      },
      { autoFocus: true }
    );
  }

  // Locate the filter chip row above a feed grid. Tries known tags, then
  // falls back to role="tablist" / multiple role="tab" siblings.
  function findChipCloud() {
    const browse =
      qs('ytd-browse[page-subtype="playlists"]:not([hidden])') ||
      qs('ytd-browse:not([hidden])');
    if (!browse) return null;

    const explicit = [
      'yt-chip-cloud-renderer',
      'yt-chip-cloud-view-model',
      'ytd-feed-filter-chip-bar-renderer',
      '[role="tablist"]',
    ];
    for (const sel of explicit) {
      const el = browse.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    const tabs = Array.from(browse.querySelectorAll('[role="tab"]')).filter(
      isVisible
    );
    if (tabs.length >= 2 && tabs[0].parentElement) {
      // Confirm the tabs share a parent (= the tablist row).
      const parent = tabs[0].parentElement;
      const sameParent = tabs.filter((t) => t.parentElement === parent);
      if (sameParent.length >= 2) return parent;
    }
    return null;
  }

  // Walk up from the chosen insertion point while the parent has a grid/flex
  // layout. Without this the search field gets distributed as one of the
  // grid cells next to a playlist card on /feed/playlists.
  function escapeCellularLayout(insertPoint) {
    let { parent, before } = insertPoint;
    let depth = 0;
    while (depth < 6 && parent.parentElement) {
      const cs = getComputedStyle(parent);
      const cellular =
        cs.display === 'grid' ||
        cs.display === 'inline-grid' ||
        cs.display === 'flex' ||
        cs.display === 'inline-flex';
      if (!cellular) break;
      before = parent;
      parent = parent.parentElement;
      depth++;
    }
    return { parent, before };
  }

  // Structural fallback for the playlists feed: look inside the visible
  // ytd-browse for any element with several homogeneous, visible, text-bearing
  // children. The richest such grid is almost certainly the playlist grid,
  // regardless of which custom-element wrapper YouTube is using this week.
  function findStructuralPageGrid() {
    const browse =
      qs('ytd-browse[page-subtype="playlists"]:not([hidden])') ||
      qs('ytd-browse:not([hidden])');
    if (!browse) return null;

    const all = browse.querySelectorAll('*');
    let best = null;
    let bestScore = 0;
    for (const el of all) {
      const children = Array.from(el.children).filter((c) => {
        if (!isVisible(c)) return false;
        const txt = (c.textContent || '').trim();
        return txt.length > 0;
      });
      if (children.length < 3) continue;
      const tagSet = new Set(children.map((c) => c.tagName));
      if (tagSet.size > 2) continue;
      const score = children.length * (tagSet.size === 1 ? 2 : 1);
      if (score > bestScore) {
        best = { container: el, items: children };
        bestScore = score;
      }
    }
    return best;
  }

  function injectIntoPage(strategy) {
    if (!strategy.matches()) return;
    if (qs(`[${PAGE_MARKER_ATTR}="${strategy.name}"]`)) return;

    let container = strategy.findContainer();
    let insertPoint = container ? strategy.findInsertPoint() : null;
    let usedStructural = false;

    // Structural fallback if explicit selectors didn't work.
    if (!container || !insertPoint?.parent) {
      const structural = findStructuralPageGrid();
      if (structural) {
        container = structural.container;
        insertPoint = {
          parent: container.parentElement,
          before: container,
        };
        usedStructural = true;
      }
    }

    if (!container) return;
    if (!insertPoint?.parent) return;

    // Only escape cellular layout when we fell back to the structural grid —
    // there, the parent IS the unwanted card grid and the search would become
    // a cell. When the chip cloud was found, stay in its container so the
    // search sits in the same row as the chips.
    if (usedStructural) {
      insertPoint = escapeCellularLayout(insertPoint);
    }

    const searchUI = buildSearchUI(strategy.placeholder, 'No matching playlists');
    searchUI.setAttribute(PAGE_MARKER_ATTR, strategy.name);
    searchUI.classList.add('ytps-page');
    insertPoint.parent.insertBefore(searchUI, insertPoint.before);
    applyAdaptiveTheme(searchUI, container);

    // When sitting in the chip row, copy a real chip's exact dimensions
    // and chrome so the search field reads as another chip.
    if (!usedStructural) {
      const chipCloud = findChipCloud();
      if (chipCloud) mimicChipStyle(searchUI, chipCloud);
    }

    console.info('[ytps] page search injected for', strategy.name);

    attachFilter(
      searchUI,
      {
        getItems: () => strategy.findItems(container),
        getLabel: (item) => strategy.getLabel(item),
        observeNode: container,
      },
      { autoFocus: false }
    );
  }

  // --- New-playlist title prefill ----------------------------------------
  // When the user types a query, finds no match, and clicks "New playlist", we
  // carry that query into YouTube's native create dialog so they don't have to
  // retype what they just searched for. The query is captured at click time
  // (the save-to popup may be torn down as the create dialog opens), held
  // briefly, then dropped into the dialog's title field once it appears.
  let pendingTitle = null; // { value: string, expires: number }
  const PENDING_TTL_MS = 4000;

  // A selectable playlist row carries a checked state (you toggle membership).
  // The create button does not. We use that to reject a playlist a user happened
  // to NAME "New playlist ...", which would otherwise match the create text.
  const SELECTABLE_ROW_SELECTOR = '[role="menuitemcheckbox"], [aria-checked]';

  // Walk up from a clicked node looking for a create-playlist control. Capped
  // depth keeps us near the click target (inside the popup), so we never read
  // the textContent of large unrelated containers.
  function findCreateControlFrom(start) {
    let el = start;
    for (let i = 0; el && i < 8; i++) {
      if (el.nodeType === 1 && isCreatePlaylistItem(el)) {
        // Inside a selectable row means this is a real (possibly oddly named)
        // playlist option, not the create button.
        if (el.closest?.(SELECTABLE_ROW_SELECTOR)) return null;
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // Capture-phase click listener: read the live query synchronously before any
  // teardown. Cheap pre-filter first: the create control only ever lives inside
  // a popup, so we skip the ancestor walk for the vast majority of clicks
  // (player, thumbnails, comments). An empty query clears any stale pending.
  function onCreateClickCapture(e) {
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return;
    const popup = target.closest(POPUP_SELECTOR);
    if (!popup) return;
    if (!findCreateControlFrom(target)) return;
    const input =
      popup.querySelector(`.${INPUT_CLASS}`) ||
      document.querySelector(`.${INPUT_CLASS}`);
    const q = input && typeof input.value === 'string' ? input.value.trim() : '';
    pendingTitle = q ? { value: q, expires: Date.now() + PENDING_TTL_MS } : null;
  }

  // Drive from the same observer/poll as the search scans. Cheap no-op unless a
  // create was just triggered with a query.
  function scanCreateDialog() {
    if (!pendingTitle) return;
    if (pendingTitle.expires < Date.now()) {
      pendingTitle = null;
      return;
    }
    const popups = Array.from(
      document.querySelectorAll(POPUP_SELECTOR)
    ).filter(isVisible);
    for (const popup of popups) {
      if (!isCreateDialog(popup)) continue;
      const field = findTitleField(popup);
      if (!field) continue;
      const value = pendingTitle.value;
      pendingTitle = null; // consume once
      fillTitleField(field, value);
      console.info('[ytps] prefilled new-playlist title:', JSON.stringify(value));
      // Re-assert once next frame in case the framework re-rendered the field
      // empty right after mount. Guarded so it never fights the user: only when
      // the field is still empty AND still focused (the framework cleared it,
      // not the user moving on), and we re-set the value without stealing focus
      // or re-selecting.
      requestAnimationFrame(() => {
        if (!field.isConnected) return;
        if (getFieldValue(field).trim()) return;
        if (document.activeElement !== field) return;
        setFieldValue(field, value);
      });
      return;
    }
  }

  function isCreateDialog(popup) {
    const header = normalize(getPopupHeader(popup));
    // The save-to popup is also a visible popup; never treat it as the create
    // dialog (it has no title field to fill anyway).
    if (HEADER_PHRASES.some((p) => header.startsWith(p))) return false;
    if (CREATE_HEADER_PHRASES.some((p) => header.startsWith(p))) return true;
    // Fallback for redesigned markup: a non-save popup with a fillable title
    // field and an explicit "Create" button is almost certainly the dialog.
    const hasCreateBtn = Array.from(
      popup.querySelectorAll('button, [role="button"], tp-yt-paper-button, yt-button-shape')
    ).some((b) => isVisible(b) && normalize(b.textContent) === 'create');
    return hasCreateBtn && !!findTitleField(popup);
  }

  // Find the playlist-title field in the create dialog. Prefer a field whose
  // placeholder/label/id hints "title"/"name"; else the first empty text field.
  // Never our own search input, and never a field the user has already typed in.
  function findTitleField(popup) {
    const candidates = Array.from(
      popup.querySelectorAll(
        'input, textarea, [contenteditable="true"], [contenteditable=""]'
      )
    );
    let firstEmpty = null;
    for (const el of candidates) {
      if (el.classList.contains(INPUT_CLASS)) continue;
      if (el.closest(`.${CONTAINER_CLASS}`)) continue;
      if (!isVisible(el)) continue;
      if (getFieldValue(el).trim()) continue;
      const hint = normalize(
        [
          el.getAttribute('placeholder'),
          el.getAttribute('aria-label'),
          el.getAttribute('name'),
          el.getAttribute('id'),
        ]
          .filter(Boolean)
          .join(' ')
      );
      if (/title|name/.test(hint)) return el;
      if (!firstEmpty) firstEmpty = el;
    }
    return firstEmpty;
  }

  function fillTitleField(el, value) {
    setFieldValue(el, value);
    try {
      el.focus({ preventScroll: true });
    } catch {
      try {
        el.focus();
      } catch {
        // focus is best-effort
      }
    }
    selectAll(el);
  }

  // Set the value so YouTube's data binding registers it. For native inputs we
  // go through the prototype value setter then dispatch native input/change.
  // Assigning .value directly leaves the framework's model stale, so the
  // (otherwise disabled) Create button would never enable.
  function isFormControl(el) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  }

  // Read the current value uniformly. Note: el.isContentEditable is true for a
  // plain input nested in a contenteditable region, so prefer the form-control
  // path when the element is itself an input/textarea.
  function getFieldValue(el) {
    if (isFormControl(el)) return el.value || '';
    if (el.isContentEditable) return el.textContent || '';
    return el.value || '';
  }

  function setFieldValue(el, value) {
    // contenteditable host (and not a form control nested inside one).
    if (!isFormControl(el) && el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Select the whole value so the user can replace it with one keystroke or
  // accept it with one click on Create. Prefer the form-control selection API;
  // fall back to a DOM range only for true contenteditable hosts.
  function selectAll(el) {
    try {
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(0, (el.value || '').length);
      } else if (typeof el.select === 'function') {
        el.select();
      } else if (el.isContentEditable) {
        const sel = window.getSelection && window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    } catch {
      // Selection is a nicety; some input types reject setSelectionRange.
    }
  }

  // --- Teardown -----------------------------------------------------------
  const ITEM_PATTERN_SELECTOR = ITEM_PATTERNS.join(', ');

  // Does the popup show a Save-to title that is NOT one of the playlist rows?
  // This is the durable signal we re-check to keep a box: it survives the user
  // filtering the list down to zero matches (which hides the rows), yet still
  // rejects a generic action menu whose only "Save to ..." texts ARE rows.
  function hasSaveToTitle(popup) {
    const candidates = popup.querySelectorAll(
      'h1, h2, h3, h4, [role="heading"], yt-formatted-string, span, div'
    );
    for (const el of candidates) {
      if (el.closest(ITEM_PATTERN_SELECTOR)) continue; // a row, not a title
      if (!isVisible(el)) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length > 80) continue;
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
      if (lines.length !== 1) continue;
      const n = normalize(lines[0]);
      if (HEADER_PHRASES.some((p) => n.startsWith(p))) return true;
    }
    return false;
  }

  // Is this popup currently hosting the Save-to-playlist dialog? Used to decide
  // whether a previously-injected box should stay. Explicit save-to renderers
  // are always the dialog; otherwise require a Save-to title outside the rows.
  function popupHostsSaveTo(popup) {
    if (
      popup.querySelector(
        'ytd-add-to-playlist-renderer, ytmusic-add-to-playlist-renderer'
      )
    ) {
      return true;
    }
    return hasSaveToTitle(popup);
  }

  // Remove a popup search box once its host popup is no longer the Save-to
  // dialog: the popup was hidden/closed, or YouTube reused the same dropdown
  // element for a different menu (e.g. the three-dot action menu). Without this,
  // a box injected into a real Save-to popup (or one that slipped in during the
  // popup's incremental mount) lingers on the wrong menu. Page boxes
  // (.ytps-page) are managed by scanPages() and left alone here.
  function pruneStalePopupSearch() {
    const boxes = document.querySelectorAll(
      `.${CONTAINER_CLASS}:not(.ytps-page)`
    );
    for (const box of boxes) {
      const popup = box.closest(POPUP_SELECTOR);
      if (!popup || !isVisible(popup) || !popupHostsSaveTo(popup)) {
        box.remove();
      }
    }
  }

  // --- Scanners -----------------------------------------------------------
  function scanModals(root = document) {
    // Clear out any box stranded on a popup that is no longer the Save-to
    // dialog before deciding what (if anything) to inject this pass.
    pruneStalePopupSearch();

    let injected = false;
    for (const strat of MODAL_STRATEGIES) {
      if (root.matches && root.matches(strat.modal) && isVisible(root)) {
        injectIntoModal(root, strat);
        injected = true;
      }
      const modals = root.querySelectorAll ? root.querySelectorAll(strat.modal) : [];
      for (const modal of modals) {
        if (!isVisible(modal)) continue;
        injectIntoModal(modal, strat);
        injected = true;
      }
    }
    if (injected) return;

    // Structural fallback for redesigned popups.
    const structural = findStructuralModal(root);
    if (structural) injectIntoStructural(structural);
  }

  function scanPages() {
    for (const strat of PAGE_STRATEGIES) {
      injectIntoPage(strat);
    }
    document.querySelectorAll(`[${PAGE_MARKER_ATTR}]`).forEach((el) => {
      const name = el.getAttribute(PAGE_MARKER_ATTR);
      const strat = PAGE_STRATEGIES.find((s) => s.name === name);
      if (!strat || !strat.matches()) el.remove();
    });
  }

  let pageScanScheduled = false;
  function schedulePageScan() {
    if (pageScanScheduled) return;
    pageScanScheduled = true;
    requestAnimationFrame(() => {
      pageScanScheduled = false;
      scanPages();
    });
  }

  let modalScanScheduled = false;
  function scheduleModalScan() {
    if (modalScanScheduled) return;
    modalScanScheduled = true;
    requestAnimationFrame(() => {
      modalScanScheduled = false;
      scanModals(document);
    });
  }

  // Coalesce create-dialog scans to one run per frame, and only while a query
  // is actually pending. The create dialog mounting fires many mutations; an
  // unthrottled scan would re-run getBoundingClientRect-heavy popup checks on
  // each one for the whole pending window.
  let createScanScheduled = false;
  function scheduleCreateScan() {
    if (!pendingTitle || createScanScheduled) return;
    createScanScheduled = true;
    requestAnimationFrame(() => {
      createScanScheduled = false;
      scanCreateDialog();
    });
  }

  function scanAll(root = document) {
    scanModals(root);
    scanPages();
    scanCreateDialog();
  }

  // --- Diagnostic helper exposed on window -------------------------------
  window.__ytps_debug = () => {
    const popups = Array.from(document.querySelectorAll(POPUP_SELECTOR)).filter(
      isVisible
    );

    const report = popups.map((p) => {
      const header = getPopupHeader(p);
      const list = findListInPopup(p);
      return {
        tag: p.tagName.toLowerCase(),
        role: p.getAttribute('role'),
        header,
        headerMatches: HEADER_PHRASES.some((ph) =>
          normalize(header).startsWith(ph)
        ),
        listFound: !!list,
        listTag: list?.list.tagName.toLowerCase(),
        itemTag: list?.items[0]?.tagName.toLowerCase(),
        itemCount: list?.items.length,
        firstItemText: list?.items[0]
          ? (list.items[0].textContent || '').trim().slice(0, 80)
          : null,
      };
    });

    const customTags = new Set();
    document.querySelectorAll('*').forEach((el) => {
      if (el.tagName.includes('-') && isVisible(el)) {
        customTags.add(el.tagName.toLowerCase());
      }
    });
    const playlistTags = [...customTags].filter((t) =>
      /playlist|save|add-to|lockup/.test(t)
    );

    console.log('[ytps] visible popups:', report);
    console.log('[ytps] playlist-related custom tags on page:', playlistTags);
    return { report, playlistTags };
  };

  // Diagnostic for the /feed/playlists page detection.
  window.__ytps_debug_page = () => {
    const strat = PAGE_STRATEGIES[0];
    const browse =
      document.querySelector('ytd-browse[page-subtype="playlists"]:not([hidden])') ||
      document.querySelector('ytd-browse:not([hidden])');
    const customTags = browse
      ? Array.from(
          new Set(
            Array.from(browse.querySelectorAll('*'))
              .filter((e) => e.tagName.includes('-'))
              .map((e) => e.tagName.toLowerCase())
          )
        ).filter((t) =>
          /(playlist|chip|grid|list-view|lockup|rich|item|section|tab|feed|filter)/.test(
            t
          )
        )
      : [];
    const structural = findStructuralPageGrid();
    const report = {
      url: location.href,
      pathname: location.pathname,
      strategyMatches: strat.matches(),
      browseFound: !!browse,
      browseSubtype: browse?.getAttribute('page-subtype') || null,
      explicitContainer: strat.findContainer()?.tagName.toLowerCase() || null,
      explicitInsertPoint: (() => {
        const ip = strat.findInsertPoint();
        if (!ip) return null;
        return {
          parent: ip.parent?.tagName.toLowerCase(),
          before: ip.before?.tagName?.toLowerCase(),
        };
      })(),
      structuralContainer: structural?.container.tagName.toLowerCase() || null,
      structuralItemCount: structural?.items.length || 0,
      structuralItemTag: structural?.items[0]?.tagName.toLowerCase() || null,
      injected: !!document.querySelector(`[${PAGE_MARKER_ATTR}="feed-playlists"]`),
      interestingTags: customTags,
    };
    console.log('[ytps] page debug:', report);
    return report;
  };

  // --- Bootstrapping ------------------------------------------------------
  scanAll();

  // Debounced full-doc scan on every mutation. Per-node scanning misses popups
  // that mount inside long-lived wrappers (e.g. yt-sheet-view-model added into
  // an existing tp-yt-iron-dropdown), because the wrapper isn't an added node.
  const rootObserver = new MutationObserver(() => {
    scheduleModalScan();
    schedulePageScan();
    scheduleCreateScan();
  });

  rootObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Capture the typed query the instant a create-playlist control is clicked,
  // before the save-to popup can be torn down. Capture phase, read-only: we
  // only read state and never call preventDefault, so YouTube's own click
  // handling is untouched.
  document.addEventListener('click', onCreateClickCapture, true);

  document.addEventListener('yt-navigate-finish', () => scanAll());
  document.addEventListener('yt-navigate-start', () => {
    // Drop any armed query so it can't carry across a navigation into an
    // unrelated create dialog.
    pendingTitle = null;
    document.querySelectorAll(`[${PAGE_MARKER_ATTR}]`).forEach((el) => el.remove());
  });

  // Safety net: every 500 ms re-run scans. The MutationObserver catches most
  // popup/page changes, but YouTube sometimes mounts content in batched ways
  // or behind attribute toggles that the observer misses. The poll keeps the
  // search field reliable without spending more than ~1ms per tick.
  setInterval(() => {
    if (document.querySelector(POPUP_SELECTOR)) {
      scanModals(document);
    }
    scanPages();
    scanCreateDialog();
  }, 500);
})();
