// Dashboard + seller panel interactions. Pages work without it; this adds copy buttons, live maths, uploads and the photo studio.
const toastEl = document.querySelector('[data-toast]');
let toastTimer;
export function toast(message, error = false) {
  toastEl.replaceChildren(Object.assign(document.createElement('b'), { textContent: message }));
  toastEl.classList.toggle('error', error);
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => toastEl.hidden = true, 350); }, error ? 7000 : 3200);
}

export async function uploadBlob(endpoint, blob, kind, name) {
  const fd = new FormData();
  fd.append('file', blob, name);
  fd.append('kind', kind);
  const r = await fetch(endpoint, { method: 'POST', body: fd, headers: { accept: 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Upload failed (${r.status})`);
  return d.url;
}

export const toBlob = (canvas, type = 'image/webp', quality = 0.9) => new Promise((ok, bad) =>
  canvas.toBlob(b => b ? ok(b) : bad(new Error('Could not encode the image')), type, quality));

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); }
  catch { toast('Copy failed. Select the text and copy it manually.', true); }
});
document.addEventListener('focusin', e => { if (e.target.matches('[data-select]')) e.target.select(); });
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-confirm]');
  if (f && !confirm(f.dataset.confirm)) e.preventDefault();
}, true);
document.addEventListener('change', e => { if (e.target.matches('[data-autosubmit]')) e.target.form.requestSubmit(); });

// Live profit / commission maths on the request page.
const deal = document.querySelector('[data-deal]');
if (deal) {
  const $ = n => deal.querySelector(`[name=${n}]`), out = n => deal.querySelector(`[data-${n}]`);
  const fmt = v => v == null || Number.isNaN(v) ? '—' : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}${deal.dataset.cur ? ' ' + deal.dataset.cur : ''}`;
  const n = v => { const x = parseFloat(String(v).replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : null; };
  const calc = () => {
    const sale = n($('sale').value), cost = n($('cost').value) ?? 0, ref = $('ref');
    const opt = ref.selectedOptions[0], rate = n($('rate').value) ?? n(opt?.dataset.rate) ?? n($('rate').dataset.defaultRate) ?? 0;
    $('rate').placeholder = ref.value ? rate : '—';
    const profit = sale == null ? null : sale - cost;
    const commission = !ref.value || sale == null ? 0 : Math.max(0, (deal.dataset.base === 'sale' ? sale : profit) * rate / 100);
    out('profit').textContent = fmt(profit);
    out('commission').textContent = ref.value ? fmt(commission) : 'No seller';
    out('keep').textContent = fmt(profit == null ? null : profit - commission);
  };
  deal.addEventListener('input', calc);
  deal.addEventListener('change', calc);
  calc();
}

// Square avatar upload (seller photos).
for (const box of document.querySelectorAll('[data-avatar]')) {
  const file = box.querySelector('[data-avatar-file]'), value = box.querySelector('[data-avatar-value]'), av = box.querySelector('.av');
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
      c.width = c.height = 512;
      c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 512, 512);
      const url = await uploadBlob(file.dataset.endpoint, await toBlob(c, 'image/webp', 0.9), 'avatar', 'avatar.webp');
      value.value = url;
      av.replaceChildren(Object.assign(new Image(), { src: url, alt: '' }));
      toast('Photo ready. Save to keep it.');
    } catch (err) { toast(err.message, true); }
    file.value = '';
  });
}

// AI scene generation (settings page).
const sceneForm = document.querySelector('[data-scene-form]');
sceneForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = sceneForm.querySelector('button'), label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Painting the scene…';
  try {
    const r = await fetch(sceneForm.action, { method: 'POST', body: new FormData(sceneForm), headers: { accept: 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
    location.href = '/admin/settings?ok=scene#scenes';
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
    btn.innerHTML = label;
  }
});

const studio = document.querySelector('[data-studio]');
if (studio) import('/dr-reps-web-demo/js/studio.js').then(m => m.init(studio, { toast, uploadBlob, toBlob }));
