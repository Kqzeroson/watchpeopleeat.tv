// watchpeopleeat.tv — light/dark theme toggle with a fade transition
(function () {
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function updateButton(btn, theme) {
    if (!btn) return;
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = btn.getAttribute('aria-label');
  }

  function ensureOverlay() {
    var overlay = document.getElementById('theme-fade-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'theme-fade-overlay';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function setTheme(theme, animate) {
    var root = document.documentElement;
    var overlay = ensureOverlay();
    var btn = document.getElementById('theme-toggle');

    if (!animate) {
      root.setAttribute('data-theme', theme);
      localStorage.setItem('wpe-theme', theme);
      updateButton(btn, theme);
      return;
    }

    // fade to opaque (covering the page with the CURRENT background)
    overlay.style.background = getComputedStyle(root).getPropertyValue('--bg');
    overlay.classList.add('active');

    setTimeout(function () {
      root.setAttribute('data-theme', theme);
      localStorage.setItem('wpe-theme', theme);
      updateButton(btn, theme);
      // overlay now matches the NEW background too (var(--bg) resolves live),
      // so fading it out reveals the new theme underneath
      overlay.style.background = getComputedStyle(root).getPropertyValue('--bg');
      requestAnimationFrame(function () {
        overlay.classList.remove('active');
      });
    }, 260);
  }

  function toggleTheme() {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureOverlay();
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      updateButton(btn, currentTheme());
      btn.addEventListener('click', toggleTheme);
    }
  });

  window.wpeToggleTheme = toggleTheme;
})();
