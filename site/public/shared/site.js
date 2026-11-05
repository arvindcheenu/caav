// Light, dark or system theme: remembered per browser, shared by every page and embedded
// slide. Fires "hv-theme" when it changes. Put <span data-theme-picker></span> where you want the control.
(function () {
  var root = document.documentElement, KEY = "heedvision-theme";
  var dark = matchMedia("(prefers-color-scheme: dark)");
  var forced = /[?&]theme=(dark|light)/.exec(location.search); // for stills and testing
  // Chrome reports a light colour scheme while it prints, which would flip a dark "system" page
  // halfway through. The print view is light unless ?theme=dark asks otherwise.
  if (!forced && /[?&](view=print|print-pdf)/.test(location.search)) forced = [0, "light"];
  function mode() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }
  function apply() {
    var m = forced ? forced[1] : mode();
    var on = m === "dark" || (m === "system" && dark.matches);
    var was = root.classList.contains("dark");
    root.classList.toggle("dark", on);
    document.querySelectorAll("[data-theme-picker] button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode())); });
    if (was !== on) window.dispatchEvent(new Event("hv-theme"));
  }
  function set(m) { try { localStorage.setItem(KEY, m); } catch (e) {} apply(); }
  var MODES = ["light", "dark", "system"];
  var FA = { light: "sun", dark: "moon", system: "desktop" }; // data-fa="sun" data-fa="moon" data-fa="desktop"
  var ICON = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6M12 17v4"/>',
  };
  function mount(el) {
    el.className = "theme-picker";
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", "Theme");
    el.innerHTML = MODES.map(function (m) {
      return '<button type="button" data-mode="' + m + '" title="' + m[0].toUpperCase() + m.slice(1) + '" aria-label="' + m[0].toUpperCase() + m.slice(1) + ' theme" aria-pressed="' + (m === mode()) + '"><svg data-fa="' + FA[m] + '" aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[m] + "</svg></button>";
    }).join("");
  }
  window.HVTheme = {
    set: set, mode: mode,
    cycle: function () { set(MODES[(MODES.indexOf(mode()) + 1) % 3]); },
    isDark: function () { return root.classList.contains("dark"); },
    mountAll: function () { document.querySelectorAll("[data-theme-picker]").forEach(mount); },
  };
  apply();
  dark.addEventListener("change", apply);
  addEventListener("storage", function (e) { if (e.key === KEY) apply(); });
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-theme-picker] button"); if (b) set(b.dataset.mode); });
  document.addEventListener("DOMContentLoaded", window.HVTheme.mountAll);
})();
