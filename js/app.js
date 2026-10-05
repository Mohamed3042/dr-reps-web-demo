// Storefront enhancements. Everything works without JavaScript; this adds motion, the bag pop-up and small conveniences.
document.documentElement.classList.add('js');

// Reveal-on-scroll, staggered within each group.
const io = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -6% 0px' });
document.querySelectorAll('.reveal').forEach(el => {
  el.style.setProperty('--d', `${Math.min([...el.parentElement.children].indexOf(el), 6) * 0.06}s`);
  io ? io.observe(el) : el.classList.add('in');
});

// Header hairline once the page scrolls.
const nav = document.querySelector('.nav');
const onScroll = () => nav?.classList.toggle('scrolled', scrollY > 4);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Submit selects/inputs marked data-autosubmit as soon as they change.
document.addEventListener('change', e => {
  if (e.target.matches('[data-autosubmit]')) e.target.form.requestSubmit();
});

// Quantity steppers.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const input = b.parentElement.querySelector('input');
  input.value = Math.min(999, Math.max(1, (parseInt(input.value) || 1) + Number(b.dataset.step)));
});

// Product gallery: thumbnails scroll the main strip; the strip highlights the current thumbnail.
for (const g of document.querySelectorAll('[data-gallery]')) {
  const main = g.querySelector('.g-main'), thumbs = [...g.querySelectorAll('[data-goto]')];
  thumbs.forEach(t => t.addEventListener('click', () => main.scrollTo({ left: main.clientWidth * Number(t.dataset.goto), behavior: 'smooth' })));
  const mark = () => { const i = Math.round(main.scrollLeft / main.clientWidth); thumbs.forEach((t, j) => t.classList.toggle('on', i === j)); };
  main.addEventListener('scroll', mark, { passive: true });
  mark();
}

// Close the mobile menu after picking a link (in-page anchors don't navigate away).
document.querySelectorAll('.menu-panel a').forEach(a => a.addEventListener('click', () => a.closest('details').open = false));

// Add to bag without leaving the page.
const toastEl = document.querySelector('[data-toast]');
let toastTimer;
function toast({ title, sub, image, action, error }) {
  toastEl.replaceChildren();
  toastEl.classList.toggle('error', !!error);
  if (image) { const img = new Image(); img.src = image; img.alt = ''; toastEl.append(img); }
  const text = document.createElement('div');
  const b = document.createElement('b'); b.textContent = title;
  const s = document.createElement('small'); s.textContent = sub || '';
  text.append(b, s);
  toastEl.append(text);
  if (action) { const a = document.createElement('a'); a.className = 'btn btn-primary btn-sm'; a.href = action.href; a.textContent = action.label; toastEl.append(a); }
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => toastEl.hidden = true, 350); }, 4500);
}
document.addEventListener('submit', async e => {
  const f = e.target;
  if (!f.matches('[data-add-to-bag]')) return;
  e.preventDefault();
  const btn = f.querySelector('button:not([type=button])');
  btn.disabled = true;
  try {
    const r = await fetch(f.action, { method: 'POST', body: new FormData(f), headers: { accept: 'application/json' } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not add that item.');
    const count = document.querySelector('[data-bag-count]');
    count.textContent = d.count;
    count.hidden = !d.count;
    count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
    toast({ title: 'Added to your request bag', sub: `${d.added.name}${d.added.size ? ` · size ${d.added.size}` : ''}`, image: d.added.image, action: { href: '/bag', label: 'View bag' } });
  } catch (err) {
    toast({ title: 'Not added', sub: err.message, error: true });
  } finally {
    btn.disabled = false;
  }
});
