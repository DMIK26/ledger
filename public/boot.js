/* Runs before first paint: applies the saved theme so there is no flash of the wrong colours. */
(function () {
  try {
    var boot = JSON.parse(localStorage.getItem('ledger.boot') || '{}');
    var root = document.documentElement;
    if (boot.language === 'te' || boot.language === 'hi') root.lang = boot.language;
    var dark;
    if (boot.theme === 'light' || boot.theme === 'dark') {
      root.dataset.theme = boot.theme;
      dark = boot.theme === 'dark';
    } else {
      dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    var bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (bar) bar.setAttribute('content', dark ? 'black-translucent' : 'default');
    if (boot.theme === 'light' || boot.theme === 'dark') {
      var color = dark ? '#141413' : '#faf9f5';
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
        m.setAttribute('content', color);
        m.removeAttribute('media');
      });
    }
  } catch (e) {
    /* storage blocked: fall back to the system theme */
  }
})();
