/**
 * The contents rail and scroll bar, as on the paper page. shared/progress.js draws them; this says what is
 * on this page. Headings come from the nav's data-headings, so a page lists what suits it.
 */
declare const HVProgress: {
  bar(element: Element): void;
  rail(list: Element, items: Array<{ el: { getBoundingClientRect(): { top: number; height: number } }; link: HTMLElement }>, options?: { mark?: boolean }): () => void;
};

const nav = document.querySelector<HTMLElement>(".page-toc");
const list = nav?.querySelector("ol");
const bar = document.querySelector(".page-bar i");
if (bar) HVProgress.bar(bar);

if (nav && list) {
  const headings = [...document.querySelectorAll<HTMLElement>(nav.dataset.headings ?? "")];
  const items = headings.map((heading, index) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent;
    item.append(link);
    list.append(item);
    // A section runs from its heading to the next one, or the end of the page's main column.
    const next = headings[index + 1];
    return {
      link,
      el: {
        getBoundingClientRect() {
          const top = heading.getBoundingClientRect().top;
          const end = next ? next.getBoundingClientRect().top : document.querySelector("main")!.getBoundingClientRect().bottom;
          return { top, height: end - top };
        },
      },
    };
  });
  const updateRail = items.length ? HVProgress.rail(list, items, { mark: true }) : () => {};

  // The playground is wider than the page's column, so the rail steps aside while it is on screen.
  const wide = document.querySelector(".wide");
  if (wide) {
    new IntersectionObserver(([entry]) => {
      nav.hidden = entry.isIntersecting;
      updateRail(); // it can't measure itself while hidden
    }).observe(wide);
  }
}
