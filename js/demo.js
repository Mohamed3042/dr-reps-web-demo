// GitHub Pages preview: a banner, read-only forms, client-side filters for pages that normally filter on the server,
// and a photo studio that keeps its results in the browser instead of uploading.
(() => {
  const params = new URLSearchParams(location.search);
  const term = (params.get('q') || '').toLowerCase().trim();

  const css = document.createElement('style');
  css.textContent = '@media (max-width:640px){.demo-bar{font-size:11px!important;padding:7px 14px!important;bottom:10px!important}}@media (max-width:860px){body:has(.buy-bar) .demo-bar{bottom:78px!important}}@media (max-width:900px){body.dash .demo-bar{bottom:calc(80px + env(safe-area-inset-bottom))!important}}.demo-bar{position:fixed;z-index:70;left:50%;bottom:16px;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 32px);background:#c7a1ce;color:#111;font:600 13px/1.45 Tomorrow,system-ui,sans-serif;text-align:center;padding:9px 18px;border-radius:999px;box-shadow:0 12px 32px -8px rgba(0,0,0,.6)}' +
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

  // The ordering flow is walked through pre-built snapshots: sign in → bag → WhatsApp → order page → price code.
  const D = window.DEMO || {}, base = D.base || '';
  const signedIn = (() => { try { return localStorage.demoIn === '1'; } catch { return false; } })();
  const setIn = on => { try { if (on) localStorage.demoIn = '1'; else localStorage.removeItem('demoIn'); } catch {} };
  const goTo = p => setTimeout(() => { location.href = base + p; }, 900);

  // Posts can't be saved on a static site. Search forms (GET) keep working.
  window.addEventListener('submit', e => {
    const f = e.target;
    if ((f.getAttribute('method') || 'get').toLowerCase() === 'get') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const action = f.getAttribute('action') || '';
    if (/\/account\/(login|signup)$/.test(action)) {
      setIn(true);
      const next = params.get('next') || '/account/';
      toast('You’re signed in', 'Preview: you’re now Sara, the demo shopper.');
      return goTo(next === '/bag' ? '/bag-signed-in' : next);
    }
    if (/\/account\/logout$/.test(action)) { setIn(false); return goTo('/'); }
    if (f.matches('[data-wa-order]')) {
      toast('Opening WhatsApp…', 'Preview: on the live store WhatsApp opens with the order filled in.');
      return goTo(`/orders/${D.sent}-sent`);
    }
    if (action.endsWith(`/orders/${D.code}/code`)) {
      toast('Code accepted', 'Preview: any code works here.');
      return goTo(`/orders/${D.code}-unlocked`);
    }
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
    // Signed-in state lives in this browser only: the header link and the bag follow it.
    const acct = document.querySelector('.acct-link');
    if (acct && !document.querySelector('.acct-head, .order, [data-wa-order]')) {
      acct.href = base + (signedIn ? '/account/' : '/account/login');
      const label = acct.querySelector('span');
      if (label) label.textContent = signedIn ? 'My orders' : 'Sign in';
    }
    if (signedIn && /\/bag\/?$/.test(location.pathname)) return location.replace(`${base}/bag-signed-in`);

    if (window.top === window) { // no banner inside the device preview frames
      const bar = document.createElement('div');
      bar.className = 'demo-bar';
      bar.append('Demo data · saving off');
      if (!location.pathname.endsWith('/admin/preview')) {
        const a = Object.assign(document.createElement('a'), { href: `${window.DEMO?.base || ''}/admin/preview`, textContent: 'Phone & seller view' });
        bar.append(' · ', a);
      }
      document.body.prepend(bar);
    }

    // Device preview: every seller option points at the one exported seller panel, so keep just the first.
    const sellerSelect = document.querySelector('[data-preview] [data-seller]');
    if (sellerSelect) [...sellerSelect.options].slice(1).forEach(o => o.remove());

    // Shop: category, condition, search and sort.
    const cards = [...document.querySelectorAll('.shop-head ~ .block .tile')];
    if (cards.length) {
      const cat = params.get('cat') || '', cond = params.get('cond') || '';
      const n = hideUnless(cards, c => (!cat || c.dataset.cat === cat) && (!cond || c.dataset.cond === cond) && (!term || c.dataset.q.includes(term)));
      if (params.get('sort') === 'az') {
        const grid = cards[0].parentElement;
        cards.sort((a, b) => a.querySelector('.tile-name').textContent.localeCompare(b.querySelector('.tile-name').textContent)).forEach(c => grid.append(c));
      }
      document.querySelectorAll('.cat-nav a').forEach(a => a.classList.toggle('on', (new URL(a.href).searchParams.get('cat') || '') === cat));
      const h1 = document.querySelector('.shop-title'); if (h1) h1.textContent = cat || cond || (term ? `Results for “${params.get('q')}”` : h1.textContent);
      const count = document.querySelector('[data-count]'); if (count) count.textContent = `${n} ${n === 1 ? 'item' : 'items'}`;
      document.querySelectorAll('.filters select').forEach(s => s.value = params.get(s.name) || s.options[0].value);
      document.querySelectorAll('input[name=q]').forEach(i => i.value = params.get('q') || '');
      const filters = document.querySelector('.filters'); // keep the search when a filter changes
      if (filters && params.get('q')) filters.prepend(Object.assign(document.createElement('input'), { type: 'hidden', name: 'q', value: params.get('q') }));
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
