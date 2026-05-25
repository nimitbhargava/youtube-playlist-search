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
          // Insert AFTER the chip cloud (between chips and grid). Use
          // nextElementSibling as the `before` so we land just below.
          return {
            parent: chips.parentElement,
            before: chips.nextElementSibling,
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
    return /^(\+\s*)?(new|create)\s+playlist/.test(txt);
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
      const header = getPopupHeader(popup);
      const headerNorm = normalize(header);
      if (!HEADER_PHRASES.some((p) => headerNorm.startsWith(p))) continue;

      const listInfo = findListInPopup(popup);
      if (!listInfo) continue;

      return { popup, header, ...listInfo };
    }
    return null;
  }

  function getPopupHeader(popup) {
    // Heuristic: the first short text node near the top of the popup.
    const headingCandidates = popup.querySelectorAll(
      'h1, h2, h3, h4, [role="heading"], yt-formatted-string, span, div'
    );
    for (const el of headingCandidates) {
      if (!isVisible(el)) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      if (text.length > 80) continue;
      const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
      if (lines.length !== 1) continue;
      return lines[0];
    }
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

  // Mirror only the font family. Earlier versions also tried to mirror the
  // popup's background, but walking up from a transparent popup wrapper
  // overshot and picked the page background — close-but-not-matching color.
  // The CSS uses YouTube's --yt-spec-menu-background design token instead,
  // which matches the actual popup chrome regardless of theme.
  function applyAdaptiveTheme(searchUI, scope) {
    try {
      const heading = scope.querySelector(
        'h1, h2, h3, [role="heading"], yt-formatted-string'
      );
      const cs = heading ? getComputedStyle(heading) : null;
      if (cs?.fontFamily) searchUI.style.setProperty('--ytps-font', cs.fontFamily);
    } catch {
      // Fall back to CSS defaults.
    }
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
  function injectIntoModal(modal, strategy) {
    if (!modal || !modal.isConnected) return;
    if (modal.querySelector(`.${CONTAINER_CLASS}`)) return;

    const list =
      strategy.list && typeof strategy.list === 'string'
        ? modal.querySelector(strategy.list)
        : strategy.list;
    if (!list) return;

    const searchUI = buildSearchUI('Search your playlists', 'No matching playlists');
    list.parentElement?.insertBefore(searchUI, list);
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
    list.parentElement?.insertBefore(searchUI, list);
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
        // restore them.
        getItems: () =>
          itemSelector
            ? Array.from(list.querySelectorAll(itemSelector))
            : Array.from(list.children),
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

  // --- Scanners -----------------------------------------------------------
  function scanModals(root = document) {
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

  function scanAll(root = document) {
    scanModals(root);
    scanPages();
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
  });

  rootObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener('yt-navigate-finish', () => scanAll());
  document.addEventListener('yt-navigate-start', () => {
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
  }, 500);
})();
