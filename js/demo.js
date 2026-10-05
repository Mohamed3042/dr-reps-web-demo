// GitHub Pages preview: a banner, read-only forms, client-side filters for pages that normally filter on the server,
// and a photo studio that keeps its results in the browser instead of uploading.
(() => {
  const params = new URLSearchParams(location.search);
  const term = (params.get('q') || '').toLowerCase().trim();

  const css = document.createElement('style');
  css.textContent = '.demo-bar{position:fixed;z-index:70;left:50%;bottom:16px;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 32px);background:#c7a1ce;color:#111;font:600 13px/1.45 Tomorrow,system-ui,sans-serif;text-align:center;padding:9px 18px;border-radius:999px;box-shadow:0 12px 32px -8px rgba(0,0,0,.6)}' +
    '.demo-bar a{color:#111;text-decoration:underline}.demo-hidden{display:none!important}.demo-empty{padding:40px 0;text-align:center;color:#a1a1a6}';
  document.head.append(css);

  function toast(title, sub = '') {
    const t = document.querySelector('[data-toast]');
    if (!t) return alert(title);
    t.replaceChildren();
    const box = document.createElement('div');
    box.append(Object.assign(document.createElement('b'), { textContent: title }), Object.assign(document.createElement('small'), { textContent: sub }));
    t.append(box);
    t.classList.remove('error');
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.hidden = true, 350); }, 3800);
  }

  // Posts can't be saved on a static site. Search forms (GET) keep working.
  window.addEventListener('submit', e => {
    const f = e.target;
    if ((f.getAttribute('method') || 'get').toLowerCase() === 'get') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (f.matches('[data-add-to-bag]')) {
      const count = document.querySelector('[data-bag-count]');
      if (count) { count.textContent = (parseInt(count.textContent) || 0) + (parseInt(f.qty?.value) || 1); count.hidden = false; }
      return toast('Added to your request bag', 'Preview: on the live store this item is saved to the bag.');
    }
    toast('Preview only', 'On the live site this is saved. Here nothing is stored.');
  }, true);

  // Photo studio uploads become in-browser object URLs, so the clean-up can be tried for real.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (/\/(admin|seller)\/media$/.test(url) && init.body instanceof FormData)
      return new Response(JSON.stringify({ url: URL.createObjectURL(init.body.get('file')) }), { headers: { 'content-type': 'application/json' } });
    return realFetch(input, init);
  };

  const hideUnless = (els, keep) => { let n = 0; for (const el of els) { const ok = keep(el); el.classList.toggle('demo-hidden', !ok); if (ok) n++; } return n; };
  const text = el => el.textContent.toLowerCase();

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.textContent = 'Preview with demo data · saving is off';
    document.body.prepend(bar);

    // Shop: category, search and sort.
    const cards = [...document.querySelectorAll('.page-head ~ .wrap .grid .prod')];
    if (cards.length) {
      const cat = params.get('cat') || '';
      const n = hideUnless(cards, c => (!cat || c.dataset.cat === cat) && (!term || c.dataset.q.includes(term)));
      if (params.get('sort') === 'az') {
        const grid = cards[0].parentElement;
        cards.sort((a, b) => a.querySelector('h3').textContent.localeCompare(b.querySelector('h3').textContent)).forEach(c => grid.append(c));
      }
      document.querySelectorAll('.chips .chip').forEach(ch => ch.classList.toggle('on', (new URL(ch.href).searchParams.get('cat') || '') === cat));
      const h1 = document.querySelector('.page-head .h1'); if (cat && h1) h1.textContent = cat;
      const sub = document.querySelector('.page-head > p.muted'); if (sub) sub.textContent = `${n} ${n === 1 ? 'item' : 'items'}${term ? ` matching “${term}”` : ''}. Every price is quoted on request.`;
      const input = document.querySelector('#q'); if (input) input.value = params.get('q') || '';
      if (!n) cards[0].parentElement.insertAdjacentHTML('afterend', '<p class="demo-empty">Nothing matches that search in the demo catalog.</p>');
    }

    // Dashboard request lists: status tabs, seller filter, search.
    const rows = [...document.querySelectorAll('.card.flush .list .row')];
    if (rows.length && document.querySelector('.tabs')) {
      const status = params.get('status') || '', seller = params.get('seller') || '';
      const sellerName = seller && document.querySelector(`select[name=seller] option[value="${seller}"]`)?.textContent.replace(/\s*\(.*$/, '').toLowerCase();
      hideUnless(rows, r => (!status || r.querySelector(`.st-${status}`)) && (!sellerName || text(r).includes(sellerName)) && (!term || text(r).includes(term)));
      document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('on', (new URL(t.href).searchParams.get('status') || '') === status));
      const sel = document.querySelector('select[name=seller]'); if (sel) sel.value = seller;
    }

    // Commissions: the page is exported with all won deals; "Unpaid" hides the paid ones.
    if (location.pathname.endsWith('/admin/commissions')) {
      const all = params.get('show') === 'all';
      hideUnless(document.querySelectorAll('.table tbody tr'), r => all || !text(r).includes('undo paid'));
      document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('on', (new URL(t.href).searchParams.get('show') === 'all') === all));
    }

    // Generic search on tables, product tiles and share lists; tag filter on customers.
    const tag = (params.get('tag') || '').toLowerCase();
    if (term || tag) {
      hideUnless(document.querySelectorAll('.table tbody tr, .pgrid .pcard, .share-list .share-item'), el =>
        (!term || text(el).includes(term)) && (!tag || [...el.querySelectorAll('.tags .chip-sm')].some(t => t.textContent.toLowerCase() === tag)));
      document.querySelectorAll('input[name=q]').forEach(i => i.value = params.get('q') || '');
    }
  });
})();
