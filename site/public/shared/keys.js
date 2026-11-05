// Hold ⌘ (Ctrl elsewhere) and every control on screen shows a key. Press it, still holding, to use that
// control. A quick ⌘C or ⌘R is untouched: hints wait a moment, and they never use the letters that browsers
// keep for themselves (⌘W, T, N, Q), that editing needs (A, C, V, X, Z) or that people reach for (F, L, R, H, M).
(function () {
  var MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "Meta" : "Control";
  var LETTERS = "bdegijkopsuy";
  var SEL = 'a[href], button, summary, input:not([type="hidden"]), textarea, select, [role="button"]';
  var HOLD = 250;
  var embedded = window.parent !== window;

  // Inside the script page's slide, keys are passed up to the page, which has the controls.
  if (embedded) {
    var upOn = false;
    addEventListener("message", function (e) { if (e.origin === location.origin && e.data && e.data.hv === "keys-state") upOn = e.data.on; });
    ["keydown", "keyup"].forEach(function (type) {
      addEventListener(type, function (e) {
        if (e.key !== MOD && !upOn) return;
        if (type === "keydown" && upOn && e.key !== MOD && e.key !== "Escape") e.preventDefault();
        parent.postMessage({ hv: "keys", type: type, key: e.key, code: e.code, repeat: e.repeat, shift: e.shiftKey, alt: e.altKey }, location.origin);
      }, true);
    });
    addEventListener("blur", function () { parent.postMessage({ hv: "keys", type: "blur" }, location.origin); });
    return;
  }

  var timer = 0, on = false, typed = "", hints = [], layer = null, status = null, redraw = 0;

  function visible(el) {
    if (el.disabled || el.closest("[inert], [hidden], .skip")) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    var hit = document.elementFromPoint(r.left + r.width / 2, Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2)));
    return !!hit && (el === hit || el.contains(hit) || hit.contains(el) && !hit.matches("iframe"));
  }
  function codes(list) {
    if (list.length > LETTERS.length) {
      // more controls than letters: two keys each
      var all = [];
      for (var a = 0; a < LETTERS.length; a++) for (var b = 0; b < LETTERS.length; b++) all.push(LETTERS[a] + LETTERS[b]);
      return list.map(function (_, i) { return all[i]; }).filter(Boolean);
    }
    // otherwise a letter from its name, where one is free, so they're easy to remember
    var free = LETTERS.split("");
    var picked = list.map(function (el) {
      var name = (el.getAttribute("aria-label") || el.textContent || "").toLowerCase();
      var c = name.split("").find(function (ch) { return free.indexOf(ch) >= 0; });
      if (c) free.splice(free.indexOf(c), 1);
      return c || null;
    });
    return picked.map(function (c) { return c || free.shift(); });
  }
  function draw() {
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "key-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
      status = document.createElement("div");
      status.className = "sr";
      status.setAttribute("role", "status");
      document.body.appendChild(status);
    }
    layer.textContent = "";
    typed = "";
    var list = [].filter.call(document.querySelectorAll(SEL), visible);
    var keys = codes(list);
    hints = list.slice(0, keys.length).map(function (el, i) {
      var tag = document.createElement("span"), r = el.getBoundingClientRect();
      tag.className = "key-hint";
      tag.textContent = keys[i].toUpperCase();
      tag.style.left = Math.max(2, r.left - 10) + "px";
      tag.style.top = Math.max(2, r.top - 6) + "px";
      layer.appendChild(tag);
      return { el: el, key: keys[i], tag: tag };
    });
    status.textContent = hints.length + " controls have keys. Press one while holding the key down.";
  }
  function show() {
    if (document.querySelector(".reveal") && document.body.classList.contains("presenting")) return; // never on the projected slides
    on = true;
    document.body.classList.add("keys-on");
    draw();
    tellFrames();
  }
  function hide() {
    clearTimeout(timer);
    clearTimeout(redraw);
    timer = 0;
    if (!on) return;
    on = false;
    typed = "";
    hints = [];
    document.body.classList.remove("keys-on");
    if (layer) layer.textContent = "";
    tellFrames();
  }
  function tellFrames() {
    [].forEach.call(document.querySelectorAll("iframe"), function (f) {
      try { f.contentWindow.postMessage({ hv: "keys-state", on: on }, location.origin); } catch (e) {}
    });
  }
  function use(el) {
    if (window.HVTactile) window.HVTactile.play("press");
    if (el.matches("input, textarea, select")) { el.focus(); return; }
    if (el.matches("a, button, summary, [role=button]")) { el.focus({ preventScroll: true }); el.click(); }
    // what it did may have changed what's on screen
    clearTimeout(redraw);
    redraw = setTimeout(function () { if (on) draw(); }, 180);
  }
  function letter(e) {
    var k = (e.key || "").toLowerCase();
    if (/^[a-z]$/.test(k)) return k;
    var m = /^Key([A-Z])$/.exec(e.code || "");
    return m ? m[1].toLowerCase() : "";
  }
  function down(e, stop) {
    if (e.key === MOD) {
      if (e.repeat || e.shift || e.alt) return;
      clearTimeout(timer);
      timer = setTimeout(show, HOLD);
      return;
    }
    // part of an ordinary shortcut: step aside
    if (!on) { clearTimeout(timer); timer = 0; return; }
    if (e.key === "Escape") { hide(); return; }
    var k = letter(e);
    var left = k ? hints.filter(function (h) { return h.key.indexOf(typed + k) === 0; }) : [];
    if (!left.length) { hide(); return; }
    stop();
    if (e.repeat) return;
    typed += k;
    var exact = left.filter(function (h) { return h.key === typed; })[0];
    if (exact) { typed = ""; hints.forEach(function (h) { h.tag.classList.remove("dim"); }); use(exact.el); return; }
    hints.forEach(function (h) { h.tag.classList.toggle("dim", left.indexOf(h) < 0); });
  }
  function up(e) { if (e.key === MOD) hide(); }

  addEventListener("keydown", function (e) {
    down({ key: e.key, code: e.code, repeat: e.repeat, shift: e.shiftKey, alt: e.altKey }, function () { e.preventDefault(); e.stopPropagation(); });
  }, true);
  addEventListener("keyup", up, true);
  addEventListener("blur", function () { if (!document.hasFocus() || !document.activeElement || document.activeElement.tagName !== "IFRAME") hide(); });
  document.addEventListener("visibilitychange", hide);
  addEventListener("scroll", function () { if (on) { clearTimeout(redraw); redraw = setTimeout(function () { if (on) draw(); }, 80); } }, { passive: true });
  addEventListener("resize", function () { if (on) draw(); });
  addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data || e.data.hv !== "keys") return;
    var m = e.data;
    if (m.type === "keydown") down(m, function () {});
    else if (m.type === "keyup") up(m);
    else if (m.type === "blur" && !document.hasFocus()) hide();
  });
})();
