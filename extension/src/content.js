(() => {
  'use strict';

  const CONTAINER_CLASS = 'ytps-search-container';
  const INPUT_CLASS = 'ytps-input';
  const HIDDEN_CLASS = 'ytps-hidden';
  const PAGE_MARKER_ATTR = 'data-ytps-page';

  // --- Modal strategies: the "Save to playlist" popup --------------------
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

  // --- Page strategies: full pages with playlist grids -------------------
  const PAGE_STRATEGIES = [
    {
      name: 'feed-playlists',
      placeholder: 'Search your playlists',
      matches: () => /^\/feed\/playlists\/?$/.test(location.pathname),
      findContainer: () =>
        qs('ytd-browse[page-subtype="playlists"]:not([hidden]) ytd-rich-grid-renderer') ||
        qs('ytd-browse:not([hidden]) ytd-rich-grid-renderer'),
      findInsertPoint: () => {
        const chips =
          qs('ytd-browse[page-subtype="playlists"]:not([hidden]) yt-chip-cloud-renderer') ||
          qs('ytd-browse:not([hidden]) yt-chip-cloud-renderer');
        if (chips?.parentElement) {
          return { parent: chips.parentElement, before: chips };
        }
        const grid = qs('ytd-browse:not([hidden]) ytd-rich-grid-renderer');
        const contents = grid?.querySelector('#contents');
        if (contents) return { parent: contents.parentElement, before: contents };
        if (grid) return { parent: grid, before: grid.firstChild };
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
    const candidates = [
      item.querySelector('#label'),
      item.querySelector('yt-formatted-string'),
      item.querySelector('[id*="label" i]'),
    ].filter(Boolean);
    for (const c of candidates) {
      const t = (c.getAttribute('title') || c.textContent || '').trim();
      if (t) return t;
    }
    return (item.textContent || '').trim();
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
    const txt = (item.textContent || '').trim().toLowerCase();
    return /(new|create)\s+playlist/.test(txt);
  }

  function findGenericModal(root = document) {
    const candidates = root.querySelectorAll(
      '[id="playlists"], [aria-label*="playlist" i], [aria-labelledby*="playlist" i]'
    );
    for (const c of candidates) {
      if (!isVisible(c)) continue;
      const items = c.querySelectorAll(
        '[role="option"], [role="menuitemcheckbox"], [role="checkbox"]'
      );
      if (items.length >= 2) {
        return {
          modal:
            c.closest('tp-yt-paper-dialog, [role="dialog"], ytd-popup-container') ||
            c.parentElement ||
            c,
          list: c,
        };
      }
    }
    return null;
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

  // Mirror computed colors from the host so the search field blends in even
  // when YouTube renames CSS variables. Runs once per inject.
  function applyAdaptiveTheme(searchUI, scope) {
    try {
      const probe = scope.querySelector(
        'yt-formatted-string, #label, #video-title, span, div'
      );
      const fieldBg = scope.querySelector(
        '[role="option"], yt-chip-cloud-chip-renderer, yt-icon-button, button'
      );
      const cs = probe ? getComputedStyle(probe) : null;
      const bgCs = fieldBg ? getComputedStyle(fieldBg) : null;
      if (cs?.color) searchUI.style.setProperty('--ytps-fg', cs.color);
      if (cs?.fontFamily) searchUI.style.setProperty('--ytps-font', cs.fontFamily);
      if (bgCs?.backgroundColor && bgCs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        searchUI.style.setProperty('--ytps-field-bg', bgCs.backgroundColor);
      }
    } catch {
      // Fall back to CSS defaults.
    }
  }

  function attachFilter(searchUI, ctx, opts = {}) {
    const input = searchUI.querySelector(`.${INPUT_CLASS}`);
    const clearBtn = searchUI.querySelector('.ytps-clear');
    const emptyState = searchUI.querySelector('.ytps-empty');

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

    // Stop YouTube's global hotkeys (k j l space /) from firing while typing.
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

  function injectIntoPage(strategy) {
    if (!strategy.matches()) return;
    if (qs(`[${PAGE_MARKER_ATTR}="${strategy.name}"]`)) return;

    const container = strategy.findContainer();
    if (!container) return;

    const insertPoint = strategy.findInsertPoint();
    if (!insertPoint?.parent) return;

    const searchUI = buildSearchUI(strategy.placeholder, 'No matching playlists');
    searchUI.setAttribute(PAGE_MARKER_ATTR, strategy.name);
    searchUI.classList.add('ytps-page');
    insertPoint.parent.insertBefore(searchUI, insertPoint.before);
    applyAdaptiveTheme(searchUI, container);

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
    for (const strat of MODAL_STRATEGIES) {
      if (root.matches && root.matches(strat.modal) && isVisible(root)) {
        injectIntoModal(root, strat);
      }
      const modals = root.querySelectorAll ? root.querySelectorAll(strat.modal) : [];
      for (const modal of modals) {
        if (!isVisible(modal)) continue;
        injectIntoModal(modal, strat);
      }
    }
    const generic = findGenericModal(root);
    if (generic) {
      injectIntoModal(generic.modal, {
        list: generic.list,
        item: '[role="option"], [role="menuitemcheckbox"], [role="checkbox"]',
        label: null,
      });
    }
  }

  function scanPages() {
    for (const strat of PAGE_STRATEGIES) {
      injectIntoPage(strat);
    }
    // Remove orphan page-search elements from pages no longer matching.
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

  function scanAll(root = document) {
    scanModals(root);
    scanPages();
  }

  // --- Bootstrapping ------------------------------------------------------
  scanAll();

  const rootObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        scanModals(node);
      }
    }
    schedulePageScan();
  });

  rootObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // YouTube SPA navigation hooks.
  document.addEventListener('yt-navigate-finish', () => scanAll());
  document.addEventListener('yt-navigate-start', () => {
    document.querySelectorAll(`[${PAGE_MARKER_ATTR}]`).forEach((el) => el.remove());
  });
})();
