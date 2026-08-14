/*
 * Beach League Mobile — Dark Theme Toggle
 * ========================================
 * Auto-injects a dark/light toggle into the state switcher.
 * Persists preference in localStorage.
 * Falls back to system preference (prefers-color-scheme).
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'beach-league-theme';

  /* ── Resolve initial theme ── */
  var saved = localStorage.getItem(STORAGE_KEY);
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = saved ? saved === 'dark' : prefersDark;

  /* Apply immediately to avoid flash */
  if (isDark) document.body.classList.add('dark-theme');

  /* ── Build toggle UI ── */
  function createToggle() {
    var switcher = document.querySelector('.state-switcher .sw-pills');

    /* Divider */
    var divider = document.createElement('div');
    divider.style.cssText =
      'width: 1px; height: 22px; background: #555; margin: 0 6px; flex-shrink: 0;';

    /* Toggle pill */
    var pill = document.createElement('button');
    pill.className = 'sw-pill dark-toggle';
    styleToggle(pill);

    pill.addEventListener('click', function (e) {
      e.stopPropagation();
      document.body.classList.toggle('dark-theme');
      var nowDark = document.body.classList.contains('dark-theme');
      localStorage.setItem(STORAGE_KEY, nowDark ? 'dark' : 'light');
      styleToggle(pill);
    });

    if (switcher) {
      switcher.appendChild(divider);
      switcher.appendChild(pill);
    }
  }

  function styleToggle(pill) {
    var nowDark = document.body.classList.contains('dark-theme');
    pill.innerHTML = nowDark
      ? '&#9788; Light'   /* sun symbol */
      : '&#9789; Dark';   /* moon symbol */
    if (nowDark) {
      pill.style.cssText =
        'background: #e0b44c; border-color: #e0b44c; color: #0d1117; font-weight: 700;';
    } else {
      pill.style.cssText =
        'background: #1a1a2e; border-color: #1a1a2e; color: #e6edf3; font-weight: 700;';
    }
  }

  /* ── Listen for system preference changes ── */
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', function (e) {
      if (!localStorage.getItem(STORAGE_KEY)) {
        if (e.matches) {
          document.body.classList.add('dark-theme');
        } else {
          document.body.classList.remove('dark-theme');
        }
        var pill = document.querySelector('.dark-toggle');
        if (pill) styleToggle(pill);
      }
    });

  /* ── Init on DOM ready ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggle);
  } else {
    createToggle();
  }
})();
