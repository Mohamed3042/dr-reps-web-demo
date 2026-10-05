// Storefront conveniences. Every page works without JavaScript; this adds sliders, quick add and small helpers.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const step = (el, i) => el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
const at = el => Math.round(el.scrollLeft / el.clientWidth);

// Home banner slider: arrows, dots, autoplay (paused while hovered or hidden).
for (const hero of document.querySelectorAll('[data-hero]')) {
  const track = hero.querySelector('.hero-track'), dots = [...hero.querySelectorAll('[data-hero-go]')], n = dots.length;
  if (!n) continue;
  const go = i => step(track, (i + n) % n);
  hero.addEventListener('click', e => {
    const b = e.target.closest('[data-hero-step], [data-hero-go]');
    if (b) go(b.dataset.heroGo != null ? +b.dataset.heroGo : at(track) + +b.dataset.heroStep);
  });
  track.addEventListener('scroll', () => dots.forEach((d, i) => d.classList.toggle('on', i === at(track))), { passive: true });
  if (!reduced) setInterval(() => { if (!document.hidden && !hero.matches(':hover')) go(at(track) + 1); }, 5500);
}

// Product rails: arrow buttons scroll by most of a screen.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rail-step]');
  if (!b) return;
  const t = b.parentElement.querySelector('.rail-track');
  t.scrollBy({ left: +b.dataset.railStep * t.clientWidth * 0.85, behavior: reduced ? 'auto' : 'smooth' });
});

// Product gallery: thumbnails and dots follow the main photo strip.
for (const g of document.querySelectorAll('[data-gallery]')) {
  const strip = g.querySelector('.pdp-imgs'), marks = [...g.querySelectorAll('.pdp-dots i, [data-show]')];
  g.addEventListener('click', e => { const b = e.target.closest('[data-show]'); if (b) step(strip, +b.dataset.show); });
  if (marks.length) strip.addEventListener('scroll', () => {
    const i = at(strip);
    marks.forEach(m => m.classList.toggle('on', +(m.dataset.show ?? [...m.parentElement.children].indexOf(m)) === i));
  }, { passive: true });
}

// Grid density on the shop page (4 or 6 per row), remembered per visitor.
const tiles = document.querySelector('.shop-head ~ .block [data-tiles]');
const density = document.querySelector('.density');
function setCols(n) {
  if (!tiles) return;
  tiles.style.setProperty('--cols', n);
  tiles.classList.toggle('dense', n === '6');
  density?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.cols === n));
  try { localStorage.drCols = n; } catch {}
}
density?.addEventListener('click', e => { const b = e.target.closest('[data-cols]'); if (b) setCols(b.dataset.cols); });
try { if (['4', '6'].includes(localStorage.drCols)) setCols(localStorage.drCols); } catch {}

// Submit selects/inputs marked data-autosubmit as soon as they change.
document.addEventListener('change', e => { if (e.target.matches('[data-autosubmit]')) e.target.form.requestSubmit(); });

// Quantity steppers.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const input = b.parentElement.querySelector('input');
  input.value = Math.min(999, Math.max(1, (parseInt(input.value) || 1) + Number(b.dataset.step)));
});

// Close the mobile menu after picking a link; close an open size picker when clicking elsewhere.
document.querySelectorAll('.sheet a').forEach(a => a.addEventListener('click', () => a.closest('details').open = false));
document.addEventListener('click', e => document.querySelectorAll('.qa-sizes[open]').forEach(d => d.contains(e.target) || d.removeAttribute('open')));

// One tap orders: create the order, open WhatsApp with it filled in, and move this tab to the order page.
// The WhatsApp window is opened during the tap itself, so popup blockers let it through.
document.addEventListener('submit', async e => {
  const f = e.target;
  if (!f.matches('[data-wa-order]')) return;
  e.preventDefault();
  const win = window.open('', '_blank'), btn = f.querySelector('button:not([type=button])');
  if (btn) btn.disabled = true;
  try {
    const r = await fetch(f.action, { method: 'POST', body: new FormData(f), headers: { accept: 'application/json' } });
    const d = await r.json();
    if (d.login) { win?.close(); location.href = d.login; return; }
    if (!r.ok) throw new Error(d.error || 'Your order could not be sent.');
    if (win && d.wa) { win.location.href = d.wa; location.href = d.url; } else { win?.close(); location.href = `${d.url}?sent=1`; }
  } catch (err) {
    win?.close();
    if (btn) btn.disabled = false;
    toast({ title: 'Not sent', sub: err.message, error: true });
  }
});

// Add to bag without leaving the page (quick add on tiles, and the product page form).
const toastEl = document.querySelector('[data-toast]');
let toastTimer;
function toast({ title, sub, image, action, error }) {
  toastEl.replaceChildren();
  toastEl.classList.toggle('error', !!error);
  if (image) toastEl.append(Object.assign(new Image(), { src: image, alt: '' }));
  const text = document.createElement('div');
  text.append(Object.assign(document.createElement('b'), { textContent: title }), Object.assign(document.createElement('small'), { textContent: sub || '' }));
  toastEl.append(text);
  if (action) toastEl.append(Object.assign(document.createElement('a'), { className: 'btn btn-sm', href: action.href, textContent: action.label }));
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => toastEl.hidden = true, 350); }, 4500);
}
document.addEventListener('submit', async e => {
  const f = e.target;
  if (!f.matches('[data-add-to-bag]')) return;
  e.preventDefault();
  const body = new FormData(f, e.submitter);
  f.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const r = await fetch(f.action, { method: 'POST', body, headers: { accept: 'application/json' } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not add that item.');
    const count = document.querySelector('[data-bag-count]');
    count.textContent = d.count;
    count.hidden = false;
    count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
    f.querySelector('details')?.removeAttribute('open');
    toast({ title: 'Added to your bag', sub: `${d.added.name}${d.added.size ? ` · ${d.added.size}` : ''}`, image: d.added.image, action: { href: '/bag', label: 'View bag' } });
  } catch (err) {
    toast({ title: 'Not added', sub: err.message, error: true });
  } finally {
    f.querySelectorAll('button').forEach(b => b.disabled = false);
  }
});
