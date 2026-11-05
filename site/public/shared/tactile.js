// How the site feels under the hand: a light that follows the cursor over anything clickable, and
// small synthesized sounds for pressing it. No sound files; the page makes each one when it plays.
//
// Sounds have an off switch: put <span data-sound-toggle></span> where you want it. The choice is
// remembered per browser. They start on with a mouse and off on a phone, because a roomful of phones
// clicking during a talk would be awful. The presenter view (data-sound-scope) has its own switch, off
// until you turn it on, because that laptop is usually wired to the room's speakers. The slides
// (data-silent) never make a sound.
(function () {
  var CLICKABLE = ".btn, .theme-picker button, .sound-toggle, .link-card";
  var QUIET_CLICKABLE = CLICKABLE + ", .page-toc a, .toc a, .script .click, .qs summary, .entry-go, .authors .author";
  var root = document.documentElement;
  var silent = root.hasAttribute("data-silent");
  var scope = root.getAttribute("data-sound-scope");

  // ------------------------------------------------------------ light
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var lit = [], frame = 0, last = null;
  function clear() { lit.forEach(function (el) { el.classList.remove("lit", "near"); }); lit = []; }
  function shine() {
    frame = 0;
    var e = last, hit = e.target && e.target.closest ? e.target.closest(CLICKABLE) : null;
    // the row it's in catches the light too, along its edges, as in Fluent
    var row = hit ? hit.parentElement : e.target && e.target.querySelector && e.target.querySelector(":scope > .btn, :scope > button, :scope > .link-card") ? e.target : null;
    clear();
    if (!row) return;
    [].forEach.call(row.children, function (el) {
      if (!el.matches(CLICKABLE)) return;
      var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (el !== hit && (x < -90 || y < -90 || x > r.width + 90 || y > r.height + 90)) return;
      el.style.setProperty("--mx", x + "px");
      el.style.setProperty("--my", y + "px");
      el.classList.add("lit-able", el === hit ? "lit" : "near");
      lit.push(el);
    });
  }
  if (fine) {
    addEventListener("pointermove", function (e) { last = e; if (!frame) frame = requestAnimationFrame(shine); }, { passive: true });
    document.addEventListener("pointerleave", clear);
    addEventListener("blur", clear);
    // give each control its light before it's first touched, so it fades in rather than pops
    addEventListener("pointerover", function (e) {
      var c = e.target.closest && e.target.closest(CLICKABLE);
      if (c) c.classList.add("lit-able");
    }, { passive: true });
  }

  // ------------------------------------------------------------ sound
  var KEY = "heedvision-sound" + (scope ? "-" + scope : ""), ctx = null, out = null, noise = null;
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function isOn() {
    if (silent) return false;
    var s = stored();
    return s ? s === "on" : !scope && fine;
  }
  function tick(c, dest, t, freq, q, gain, length) {
    var src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseIn(c);
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.05, length + 0.01);
  }
  function tone(c, dest, t, freq, gain, length, to) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + length + 0.01);
  }
  function noiseIn(c) {
    if (noise && noise.sampleRate === c.sampleRate) return noise;
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.1), c.sampleRate);
    var d = noise.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  var VOICES = {
    hover: function (c, d, t) { tick(c, d, t, 5200, 2, 0.03, 0.007); },
    press: function (c, d, t) { tick(c, d, t, 2300, 1.1, 0.34, 0.02); tone(c, d, t, 170, 0.16, 0.035, 90); },
    release: function (c, d, t) { tick(c, d, t, 3600, 1.3, 0.16, 0.012); },
    on: function (c, d, t) { tone(c, d, t, 620, 0.07, 0.06); tone(c, d, t + 0.05, 930, 0.07, 0.08); },
    off: function (c, d, t) { tone(c, d, t, 930, 0.06, 0.06); tone(c, d, t + 0.05, 620, 0.06, 0.08); },
    sent: function (c, d, t) { tone(c, d, t, 587, 0.07, 0.1); tone(c, d, t + 0.08, 880, 0.07, 0.15); },
    // a small bell, rising
    like: function (c, d, t) { tone(c, d, t, 740, 0.09, 0.16); tone(c, d, t + 0.07, 1109, 0.08, 0.24); tone(c, d, t + 0.07, 2218, 0.016, 0.2); },
    // three bites of a biscuit, then a pleased little note
    cookie: function (c, d, t) { tick(c, d, t, 1700, 0.8, 0.26, 0.03); tick(c, d, t + 0.05, 2600, 0.8, 0.2, 0.028); tick(c, d, t + 0.095, 1500, 0.8, 0.24, 0.034); tone(c, d, t + 0.16, 784, 0.06, 0.16); tone(c, d, t + 0.23, 1175, 0.06, 0.24); },
  };
  // browsers allow sound only after a press or a key, so nothing starts before then
  function wake() {
    if (silent || ctx || !window.AudioContext) return;
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(ctx.destination);
  }
  function play(name) {
    if (!isOn() || !ctx || !VOICES[name]) return;
    if (ctx.state === "suspended") ctx.resume();
    VOICES[name](ctx, out, ctx.currentTime);
    api.last = name;
  }

  var hovered = null, hoverAt = 0;
  if (!silent) {
    addEventListener("pointerover", function (e) {
      if (e.pointerType !== "mouse") return;
      var c = e.target.closest && e.target.closest(QUIET_CLICKABLE);
      if (c === hovered) return;
      hovered = c;
      var now = performance.now();
      if (c && now - hoverAt > 70) { hoverAt = now; play("hover"); }
    }, { passive: true });
    addEventListener("pointerdown", function (e) {
      wake();
      if (e.button === 0 && e.target.closest && e.target.closest(QUIET_CLICKABLE)) play("press");
    }, { capture: true, passive: true });
    addEventListener("keydown", wake, { capture: true, passive: true });
    document.addEventListener("click", function (e) {
      var c = e.target.closest && e.target.closest(QUIET_CLICKABLE);
      if (!c) return;
      if (e.detail === 0) play("press");
      // read a switch's state once its own handler has changed it
      // liking and agreeing to cookies have sounds of their own, played by what handles them
      if (c.hasAttribute("data-like") ? c.getAttribute("aria-pressed") === "false" : c.hasAttribute("data-yes")) return;
      if (c.hasAttribute("aria-pressed")) setTimeout(function () { play(c.getAttribute("aria-pressed") === "true" ? "on" : "off"); }, 0);
      else if (e.detail !== 0) play("release");
    });
    document.addEventListener("submit", function () { play("sent"); });
  }

  // ------------------------------------------------------------ a small celebration
  // A handful of hearts or crumbs from a control. They float above the page, so nothing else moves.
  var HEART = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 21s-8.5-5.2-10-10.5C1 6.5 3.500 4 6.500 4c2.200 0 4 1.200 5.500 3.200C13.500 5.200 15.300 4 17.500 4 20.500 4 23 6.500 22 10.500 20.500 15.800 12 21 12 21z"/></svg>';
  var calm = matchMedia("(prefers-reduced-motion: reduce)");
  function burst(el, kind) {
    if (calm.matches || !el.animate) return;
    var r = (el.querySelector("svg") || el).getBoundingClientRect(), hearts = kind === "heart";
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var colours = hearts ? ["var(--accent, #bb4a72)", "var(--title, #df6824)", "var(--both, #ec4f9c)"] : ["#a9714b", "#d9a066", "#6b3f26"];
    var layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "position:fixed;inset:0;z-index:95;pointer-events:none;overflow:hidden";
    var n = hearts ? 12 : 14, left = n;
    for (var i = 0; i < n; i++) {
      var p = document.createElement("span"), size = hearts ? 9 + Math.random() * 7 : 4 + Math.random() * 6;
      var angle = -Math.PI / 2 + (i / (n - 1) - 0.5) * Math.PI * 1.25 + (Math.random() - 0.5) * 0.3, dist = 42 + Math.random() * 52;
      var dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist, spin = (Math.random() - 0.5) * 300;
      p.style.cssText = "position:absolute;left:" + (cx - size / 2) + "px;top:" + (cy - size / 2) + "px;width:" + size + "px;height:" + size + "px;color:" + colours[i % 3] + ";" + (hearts ? "" : "background:currentColor;border-radius:" + (35 + Math.random() * 30) + "% " + (40 + Math.random() * 30) + "%;");
      if (hearts) p.innerHTML = HEART;
      layer.appendChild(p);
      p.animate([
        { transform: "translate(0, 0) scale(0.4) rotate(0deg)", opacity: 1 },
        { transform: "translate(" + dx + "px, " + dy + "px) scale(1) rotate(" + spin * 0.7 + "deg)", opacity: 1, offset: 0.55 },
        { transform: "translate(" + dx * 1.15 + "px, " + (dy + 34) + "px) scale(0.8) rotate(" + spin + "deg)", opacity: 0 },
      ], { duration: 650 + Math.random() * 250, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" }).onfinish = function () { if (--left === 0) layer.remove(); };
    }
    document.body.appendChild(layer);
    var mark = el.querySelector("svg");
    if (mark) mark.animate([{ transform: "scale(1)" }, { transform: "scale(1.4)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" });
  }

  // ------------------------------------------------------------ the switch
  var ICON = {
    on: ["volume-high", '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>'],
    off: ["volume-xmark", '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'],
  };
  function draw(el) {
    var on = isOn(), i = ICON[on ? "on" : "off"];
    el.setAttribute("aria-pressed", String(on));
    el.setAttribute("title", on ? "Sounds on" : "Sounds off");
    el.innerHTML = (on ? '<svg data-fa="volume-high"' : '<svg data-fa="volume-xmark"') + ' aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + i[1] + "</svg>";
  }
  function mount() {
    document.querySelectorAll("[data-sound-toggle]").forEach(function (slot) {
      if (silent) { slot.hidden = true; return; }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "sound-toggle";
      b.setAttribute("aria-label", "Sounds");
      slot.appendChild(b);
      draw(b);
      b.addEventListener("click", function () {
        try { localStorage.setItem(KEY, isOn() ? "off" : "on"); } catch (e) {}
        document.querySelectorAll(".sound-toggle").forEach(draw);
        wake();
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  addEventListener("storage", function (e) { if (e.key === KEY) document.querySelectorAll(".sound-toggle").forEach(draw); });

  // ------------------------------------------------------------ scrolling
  // Lists dissolve at the edge where there's more to see, and a bar shows how far through you are.
  var SOFT = ".toc-inner, .page-toc, .pq-list, .pv-notes, .hv-sheet .q-list";
  function watch(el) {
    if (el.hvSoft) return;
    el.hvSoft = true;
    el.classList.add("soft-edges");
    var bar = el.hasAttribute("data-scroll-bar") ? document.querySelector(el.getAttribute("data-scroll-bar")) : null;
    var queued = false;
    function update() {
      queued = false;
      var max = el.scrollHeight - el.clientHeight, top = el.scrollTop, can = max > 4;
      // these change only at the ends of the list, so nothing repaints on every frame of a scroll
      var t = can && top > 2, b = can && max - top > 2;
      if (t !== el.hvT) { el.hvT = t; el.style.setProperty("--fade-t", t ? "28px" : "0px"); }
      if (b !== el.hvB) { el.hvB = b; el.style.setProperty("--fade-b", b ? "28px" : "0px"); }
      el.classList.toggle("more", can && max - top > 2);
      if (bar) {
        bar.hidden = !can;
        bar.firstElementChild.style.transform = "scaleX(" + (can ? top / max : 0) + ")";
      }
    }
    function later() { if (!queued) { queued = true; requestAnimationFrame(update); } }
    el.addEventListener("scroll", later, { passive: true });
    new ResizeObserver(later).observe(el);
    new MutationObserver(later).observe(el, { childList: true, subtree: true, characterData: true });
    later();
  }
  function soften() { document.querySelectorAll(SOFT).forEach(watch); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", soften); else soften();
  addEventListener("load", function () {
    soften();
    new MutationObserver(soften).observe(document.body, { childList: true });
  });

  // The controls in the corner stay put. Reading down, they step back; scrolling up, they come forward.
  var tools = null, lastY = 0;
  addEventListener("scroll", function () {
    tools = tools || document.querySelector(".page-tools");
    if (!tools) return;
    var y = scrollY;
    if (Math.abs(y - lastY) < 6) return;
    tools.classList.toggle("receded", y > lastY && y > 80);
    lastY = y;
  }, { passive: true });

  var api = window.HVTactile = { isOn: isOn, play: play, burst: burst, voices: VOICES, last: null, state: function () { return ctx ? ctx.state : "not started"; } };
})();
