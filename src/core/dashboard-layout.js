const storageKey = "modivue-card-layouts";
const interactive = "button, input, select, textarea, a, label, summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='slider'], canvas, [data-chart], .trend-chart, .mini-chart, [_echarts_instance_]";
let layouts = {};
try { layouts = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { /* Start with the default layout. */ }
let gesture = null;
export const layoutDragging = () => Boolean(gesture);

function cards(group) { return [...group.children].filter(node => node.dataset.layoutCard); }
function arrange(group, order) {
  const items = cards(group);
  const keys = [...order.filter(key => items.some(node => node.dataset.layoutCard === key)), ...items.map(node => node.dataset.layoutCard).filter(key => !order.includes(key))];
  items.forEach(node => { node.style.order = keys.indexOf(node.dataset.layoutCard); });
  return keys;
}
function save(group, order) {
  layouts[group.dataset.layout] = order;
  localStorage.setItem(storageKey, JSON.stringify(layouts));
}

export function mountLayouts(root, view) {
  if (gesture) return;
  const groups = [...root.querySelectorAll("[data-layout]")];
  if (view !== "overview") root.querySelectorAll(".view-stack, .view-columns").forEach((group, index) => {
    const items = [...group.children].filter(node => node.matches(".panel"));
    if (items.length < 2) return;
    group.dataset.layout = `${view}:${index}`;
    items.forEach(node => { node.dataset.layoutCard = node.querySelector("[data-layout-title]")?.dataset.layoutTitle || node.id; });
    groups.push(group);
  });
  for (const group of groups) {
    arrange(group, layouts[group.dataset.layout] || []);
    for (const node of cards(group)) {
      node.tabIndex = 0;
    }
  }
}

function finish(cancelled = false) {
  if (!gesture) return;
  const current = gesture;
  gesture = null;
  clearTimeout(current.timer);
  cancelAnimationFrame(current.frame);
  if (current.card.hasPointerCapture(current.pointer)) current.card.releasePointerCapture(current.pointer);
  if (current.active) {
    current.ghost.remove();
    current.card.classList.remove("layout-source");
    document.body.classList.remove("layout-dragging");
    if (cancelled) arrange(current.group, current.original);
    else save(current.group, current.order);
    document.dispatchEvent(new Event("modivue-layout-end"));
  }
}
export function cancelLayout() { finish(true); }

function reorder(current) {
  const target = document.elementFromPoint(current.lastX, current.lastY)?.closest("[data-layout-card]");
  if (!target || target === current.card || target.parentElement !== current.group) return;
  const rect = target.getBoundingClientRect();
  if (current.lastY < rect.top + 8 || current.lastY > rect.bottom - 8) return;
  const from = current.order.indexOf(current.card.dataset.layoutCard), to = current.order.indexOf(target.dataset.layoutCard);
  current.order.splice(from, 1);
  current.order.splice(to, 0, current.card.dataset.layoutCard);
  arrange(current.group, current.order);
}

document.addEventListener("pointerdown", event => {
  if (event.button !== 0 || !event.isPrimary || event.target.closest(interactive)) return;
  const card = event.target.closest("[data-layout-card]");
  const group = card?.parentElement;
  if (!group?.dataset.layout) return;
  finish(true);
  const original = cards(group).sort((a, b) => Number(a.style.order) - Number(b.style.order)).map(node => node.dataset.layoutCard);
  const current = gesture = { card, group, original, order: [...original], x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, pointer: event.pointerId };
  current.timer = setTimeout(() => {
    if (!card.isConnected) { finish(true); return; }
    const rect = card.getBoundingClientRect();
    current.active = true;
    current.rect = rect;
    const ghost = current.ghost = card.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    const canvases = [...card.querySelectorAll("canvas")];
    ghost.querySelectorAll("canvas").forEach((canvas, index) => canvas.getContext("2d")?.drawImage(canvases[index], 0, 0));
    ghost.inert = true;
    ghost.classList.add("layout-ghost");
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
    document.body.append(ghost);
    card.classList.add("layout-source");
    document.body.classList.add("layout-dragging");
    window.getSelection()?.removeAllRanges();
    card.setPointerCapture(event.pointerId);
    const scroll = () => {
      if (gesture !== current) return;
      const delta = current.lastY < 65 ? -12 : current.lastY > innerHeight - 65 ? 12 : 0;
      if (delta) { window.scrollBy(0, delta); reorder(current); }
      current.frame = requestAnimationFrame(scroll);
    };
    current.frame = requestAnimationFrame(scroll);
  }, 420);
});

document.addEventListener("pointermove", event => {
  const current = gesture;
  if (!current || event.pointerId !== current.pointer) return;
  if (!current.active) {
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6) finish(true);
    return;
  }
  event.preventDefault();
  current.lastX = event.clientX;
  current.lastY = event.clientY;
  current.ghost.style.transform = `translate(${event.clientX - current.x}px, ${event.clientY - current.y}px)`;
  reorder(current);
}, { passive: false });
document.addEventListener("pointerup", event => {
  if (event.pointerId !== gesture?.pointer) return;
  if (gesture?.active) {
    // Suppress the click generated by releasing a dragged metric card.
    const suppress = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    document.addEventListener("click", suppress, { capture: true, once: true });
    setTimeout(() => document.removeEventListener("click", suppress, true), 0);
  }
  finish();
});
document.addEventListener("pointercancel", event => { if (event.pointerId === gesture?.pointer) finish(true); });
document.addEventListener("lostpointercapture", event => { if (event.pointerId === gesture?.pointer) finish(true); });
document.addEventListener("touchmove", event => { if (gesture?.active) event.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", event => { if (gesture?.active) event.preventDefault(); });
window.addEventListener("blur", () => finish(true));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") finish(true);
  const card = event.target.matches("[data-layout-card]") ? event.target : null;
  if (!card || !event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  const group = card.parentElement;
  if (!group?.dataset.layout) return;
  event.preventDefault();
  const order = cards(group).sort((a, b) => Number(a.style.order) - Number(b.style.order)).map(node => node.dataset.layoutCard);
  const index = order.indexOf(card.dataset.layoutCard);
  const next = Math.max(0, Math.min(order.length - 1, index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1)));
  order.splice(index, 1); order.splice(next, 0, card.dataset.layoutCard);
  arrange(group, order); save(group, order);
});
