// Scroll progress instead of scrollbars.
//   HVProgress.rail(list, items)  a rail beside a contents list that fills as you read.
//                                 items: [{ el: the section, link: its entry in the list }]
//   HVProgress.bar(el)            a bar across the page that fills as you scroll.
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rail(list, items, { line = () => innerHeight * 0.35, mark = false } = {}) {
    function update() {
      const y = line();
      let i = 0;
      items.forEach((it, k) => { if (it.el.getBoundingClientRect().top <= y) i = k; });
      const r = items[i].el.getBoundingClientRect();
      const within = clamp((y - r.top) / Math.max(1, r.height), 0, 1);
      const box = list.getBoundingClientRect(), a = items[i].link.getBoundingClientRect();
      const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      list.style.setProperty("--fill", `${atEnd ? box.height : a.top - box.top + within * a.height}px`);
      // the rail takes the colour of the section you're in
      const c = getComputedStyle(items[i].link).getPropertyValue("--sec").trim();
      if (c) list.style.setProperty("--rail", c);
      if (mark) items.forEach((it, k) => {
        it.link.classList.toggle("here", k === i);
        if (k === i) it.link.setAttribute("aria-current", "location"); else it.link.removeAttribute("aria-current");
      });
    }
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update, { passive: true });
    update();
    return update;
  }
  function bar(el) {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      el.style.transform = `scaleX(${max > 0 ? clamp(scrollY / max, 0, 1) : 0})`;
    };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update, { passive: true });
    update();
  }
  window.HVProgress = { rail, bar };
})();
