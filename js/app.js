// Storefront motion and conveniences. Every page works without JavaScript; this layers the cinema on top.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Header: transparent over the home campaign, solid once you scroll.
const hdr = document.querySelector('[data-hdr]');
const onScroll = () => hdr?.classList.toggle('solid', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Reveal blocks as they enter; campaign slides get their slow zoom + caption rise.
const io = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
document.querySelectorAll('.reveal, [data-slide]').forEach(el => {
  if (el.classList.contains('reveal')) el.style.setProperty('--d', `${Math.min([...el.parentElement.children].indexOf(el) % 4, 3) * 0.08}s`);
  io && !reduced ? io.observe(el) : el.classList.add('in');
});

// Product photos fade in once decoded.
const ready = img => img.classList.add('ok');
document.querySelectorAll('.tile-img img').forEach(img => img.complete && img.naturalWidth ? ready(img) : img.addEventListener('load', () => ready(img), { once: true }));

// Shared-element page transition: the tapped photo becomes the product page's hero photo.
document.addEventListener('click', e => {
  const link = e.target.closest('.tile-link');
  if (!link || e.metaKey || e.ctrlKey) return;
  const img = link.querySelector('.tile-img img, .tile-img .ph');
  if (img) img.style.viewTransitionName = 'pimg';
});
addEventListener('pageshow', () => document.querySelectorAll('[style*="view-transition-name"]').forEach(el => el.style.viewTransitionName = ''));

// Grid density (2 / 4 / 6 per row), remembered per visitor.
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
try { if (localStorage.drCols) setCols(localStorage.drCols); } catch {}

// Category index: a photo peeks out and follows the cursor.
const peek = document.querySelector('[data-peek]');
if (peek && matchMedia('(hover: hover)').matches) {
  for (const row of document.querySelectorAll('.index-row[data-preview]')) {
    row.addEventListener('pointerenter', () => { peek.src = row.dataset.preview; peek.classList.add('on'); });
    row.addEventListener('pointerleave', () => peek.classList.remove('on'));
  }
  addEventListener('pointermove', e => { peek.style.left = `${e.clientX + 140}px`; peek.style.top = `${e.clientY}px`; }, { passive: true });
}

// Submit selects/inputs marked data-autosubmit as soon as they change.
document.addEventListener('change', e => { if (e.target.matches('[data-autosubmit]')) e.target.form.requestSubmit(); });

// Quantity steppers.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const input = b.parentElement.querySelector('input');
  input.value = Math.min(999, Math.max(1, (parseInt(input.value) || 1) + Number(b.dataset.step)));
});

// Mobile product gallery: dots follow the swipe.
for (const g of document.querySelectorAll('[data-gallery]')) {
  const strip = g.querySelector('.pdp-imgs'), dots = [...g.querySelectorAll('.pdp-dots i')];
  if (dots.length) strip.addEventListener('scroll', () => {
    const i = Math.round(strip.scrollLeft / strip.clientWidth);
    dots.forEach((d, j) => d.classList.toggle('on', i === j));
  }, { passive: true });
}

// Close the mobile menu after picking a link.
document.querySelectorAll('.sheet a').forEach(a => a.addEventListener('click', () => a.closest('details').open = false));

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
    if (!r.ok) throw new Error(d.error || 'Could not add that piece.');
    const count = document.querySelector('[data-bag-count]');
    count.textContent = d.count;
    count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
    f.querySelector('details')?.removeAttribute('open');
    toast({ title: 'Added to your bag', sub: `${d.added.name}${d.added.size ? ` · ${d.added.size}` : ''}`, image: d.added.image, action: { href: '/bag', label: 'View bag' } });
  } catch (err) {
    toast({ title: 'Not added', sub: err.message, error: true });
  } finally {
    f.querySelectorAll('button').forEach(b => b.disabled = false);
  }
});
