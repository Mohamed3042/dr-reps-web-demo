// Photo studio: upload → background removal → product placed on the brand backdrop or an AI scene → uploaded to R2.
// Background removal: Cloudflare Images (BiRefNet, when the IMAGES binding is connected) first,
// then an in-browser model (ormbg, Apache-2.0, 44 MB int8, CPU) as the free fallback.
// The original is always kept, and product pixels are never regenerated: only the background changes.
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL = 'onnx-community/ormbg-ONNX';
const SIZE = 1600, THUMB = 640, MAX_PHOTOS = 12;

const ICON = {
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  wand: '<path d="M4 20 15 9M14 4v3M18 6h3M17 2l1 1M20 10l1 1"/><path d="m15 9 2-2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  scene: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.round(w), height: Math.round(h) });
const loadImage = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Could not load the image')); i.src = src; });

// Downscale so the longest side is at most `max`.
function fit(img, max) {
  const k = Math.min(1, max / Math.max(img.width, img.height)), c = canvas(img.width * k, img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// ---------- background removal ----------
let removerPromise = null;
function remover(onProgress) {
  removerPromise ??= (async () => {
    const { pipeline } = await import(TRANSFORMERS);
    // CPU (WebAssembly) on purpose: tested 2026-10-05, the WebGPU path fails on this model (unsupported MaxPool shape op),
    // and BiRefNet/BEN2 run out of memory in the browser. int8 ormbg: ~6 s per photo.
    return pipeline('background-removal', MODEL, { device: 'wasm', dtype: 'q8', progress_callback: onProgress });
  })().catch(err => { removerPromise = null; throw err; });
  return removerPromise;
}

// Tighten the mask edge (kills the faint halo of the old background) and crop to the product.
function tidy(src) {
  const w = src.width, h = src.height, ctx = src.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h), a = img.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      const v = a[i] < 24 ? 0 : a[i] > 232 ? 255 : Math.round((a[i] - 24) * 255 / 208);
      a[i] = v;
      if (v > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0 || (x1 - x0 + 1) * (y1 - y0 + 1) < w * h * 0.01) return null; // nothing recognisable was found
  let clear = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] === 0) clear++;
  if (clear < w * h * 0.005) return null; // nothing was removed, so there's no cut-out to use
  ctx.putImageData(img, 0, 0);
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// ---------- compositing ----------
// Average brightness (0–1) of the product's visible pixels, sampled small.
function brightness(cut) {
  const s = canvas(48, 48), x = s.getContext('2d', { willReadFrequently: true });
  x.drawImage(cut, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
  return n ? sum / n / 255 : 0.5;
}
// Brand backdrop; dark products get a lifted centre and a stronger lilac glow so they don't sink into the background.
function backdrop(x, dark) {
  const g = x.createRadialGradient(SIZE / 2, SIZE * 0.4, 0, SIZE / 2, SIZE * 0.46, SIZE * 0.78);
  g.addColorStop(0, dark ? '#58585c' : '#3b3b3b'); g.addColorStop(0.55, dark ? '#2e2e31' : '#232325'); g.addColorStop(1, '#141415');
  x.fillStyle = g; x.fillRect(0, 0, SIZE, SIZE);
  const glow = x.createRadialGradient(SIZE / 2, SIZE * 0.44, 0, SIZE / 2, SIZE * 0.44, SIZE * 0.44);
  glow.addColorStop(0, `rgba(199,161,206,${dark ? 0.26 : 0.15})`); glow.addColorStop(1, 'rgba(199,161,206,0)');
  x.fillStyle = glow; x.fillRect(0, 0, SIZE, SIZE);
  const floor = x.createLinearGradient(0, SIZE * 0.8, 0, SIZE);
  floor.addColorStop(0, 'rgba(0,0,0,0)'); floor.addColorStop(1, 'rgba(0,0,0,.38)');
  x.fillStyle = floor; x.fillRect(0, SIZE * 0.8, SIZE, SIZE * 0.2);
}
function drawCover(x, img) {
  const k = Math.max(SIZE / img.width, SIZE / img.height), w = img.width * k, h = img.height * k;
  x.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
}
function compose(cut, scene) {
  const c = canvas(SIZE, SIZE), x = c.getContext('2d');
  scene ? drawCover(x, scene) : backdrop(x, brightness(cut) < 0.3);
  const k = Math.min(SIZE * 0.74 / cut.width, SIZE * 0.66 / cut.height), w = cut.width * k, h = cut.height * k;
  const left = (SIZE - w) / 2, floor = SIZE * 0.84, top = floor - h;
  // Contact shadow: a soft ellipse under the product (radial gradient, works in every browser).
  const rx = w * 0.5, ry = Math.max(18, h * 0.045);
  x.save(); x.translate(SIZE / 2, floor - ry * 0.2); x.scale(1, ry / rx);
  const sh = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  sh.addColorStop(0, 'rgba(0,0,0,.6)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sh; x.fillRect(-rx, -rx, rx * 2, rx * 2); x.restore();
  x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 50; x.shadowOffsetY = 22;
  x.drawImage(cut, left, top, w, h); x.restore();
  return c;
}
function squareCrop(src) {
  const c = canvas(SIZE, SIZE), x = c.getContext('2d');
  x.fillStyle = '#151516'; x.fillRect(0, 0, SIZE, SIZE);
  drawCover(x, src);
  return c;
}

export function init(root, { toast, uploadBlob, toBlob }) {
  const input = root.querySelector('[data-images]'), shots = root.querySelector('[data-shots]'), status = root.querySelector('[data-status]');
  const auto = root.querySelector('[data-auto]'), sceneSelect = root.querySelector('[data-scene]'), drop = root.querySelector('[data-drop]');
  const fileInput = root.querySelector('[data-file]'), form = root.closest('form');
  let photos = JSON.parse(input.value || '[]');
  const cfg = JSON.parse(root.querySelector('[data-studio-config]')?.textContent || '{}');
  const sceneCache = new Map();
  let queue = Promise.resolve(), modelFiles = {};

  const setStatus = t => { status.textContent = t || ''; };
  const sync = () => { input.value = JSON.stringify(photos.filter(p => !p.busy).map(({ busy, msg, preview, ...p }) => p)); };
  const up = (blob, kind) => uploadBlob('/admin/media', blob, kind, `${kind}.${blob.type.split('/')[1]}`);
  const scene = async () => {
    const url = sceneSelect.value;
    if (!url) return null;
    if (!sceneCache.has(url)) sceneCache.set(url, loadImage(url));
    return sceneCache.get(url);
  };

  function render() {
    shots.replaceChildren(...photos.map((p, i) => {
      const el = document.createElement('figure');
      el.className = `shot${i === 0 ? ' cover' : ''}`;
      el.innerHTML = `<img alt="">${p.busy ? '<div class="busy"><span class="spinner"></span><span data-msg></span></div>' : `<div class="badges">${i === 0 ? '<em class="l">Cover</em>' : ''}${p.mode === 'clean' ? '<em>Cleaned</em>' : ''}</div><div class="tools"></div>`}`;
      el.querySelector('img').src = p.busy ? p.preview : p.thumb;
      if (p.busy) { el.querySelector('[data-msg]').textContent = p.msg; return el; }
      const tools = el.querySelector('.tools');
      const tool = (icon, label, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = svg(icon);
        b.addEventListener('click', fn);
        tools.append(b);
      };
      if (i > 0) tool(ICON.star, 'Make cover photo', () => { photos.unshift(photos.splice(i, 1)[0]); sync(); render(); });
      if (p.orig && p.mode !== 'clean') tool(ICON.wand, 'Clean up this photo', () => enqueue(p, () => reclean(p)));
      if (p.orig && p.mode === 'clean') tool(ICON.undo, 'Use the original photo', () => enqueue(p, () => useOriginal(p)));
      if (p.cut) tool(ICON.scene, 'Apply the selected backdrop', () => enqueue(p, () => replace(p)));
      tool(ICON.trash, 'Remove photo', () => { photos.splice(i, 1); sync(); render(); });
      return el;
    }));
  }
  const busyMsg = (p, msg) => { p.msg = msg; const i = photos.indexOf(p); shots.children[i]?.querySelector('[data-msg]')?.replaceChildren(msg); };

  function enqueue(p, job) {
    const prev = { ...p };
    Object.assign(p, { busy: true, msg: 'Waiting…', preview: p.thumb || p.preview });
    render();
    queue = queue.then(job).then(() => { delete p.busy; }, err => {
      Object.assign(p, prev); delete p.busy;
      toast(err.message || String(err), true);
    }).then(() => { sync(); render(); setStatus(photos.some(x => x.busy) ? 'Working…' : ''); });
    return queue;
  }

  // Background removal → cut-out canvas, or null if nothing usable was found. Server first, browser model second.
  async function cutout(src, p) {
    if (cfg.serverCutout) {
      try {
        busyMsg(p, 'Removing the background…');
        const fd = new FormData();
        fd.append('file', await toBlob(src, 'image/jpeg', 0.92), 'photo.jpg');
        const r = await fetch('/admin/cutout', { method: 'POST', body: fd });
        if (r.ok) {
          const url = URL.createObjectURL(await r.blob());
          try {
            const img = await loadImage(url), c = canvas(img.width, img.height);
            c.getContext('2d').drawImage(img, 0, 0);
            const t = tidy(c);
            if (t) return t;
          } finally { URL.revokeObjectURL(url); }
        }
      } catch (err) { console.warn('server cut-out failed, using the browser model', err); }
    }
    const rm = await remover(e => {
      if (e.status !== 'progress' || !e.total) return;
      modelFiles[e.file] = [e.loaded, e.total];
      const [l, t] = Object.values(modelFiles).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
      busyMsg(p, `Downloading the clean-up model (one time) ${Math.round(l / t * 100)}%`);
    });
    busyMsg(p, 'Removing the background…');
    const url = URL.createObjectURL(await toBlob(src, 'image/png'));
    try {
      const [out] = await rm(url);
      const raw = out.toCanvas();
      const c = canvas(raw.width, raw.height);
      c.getContext('2d').drawImage(raw, 0, 0);
      return tidy(c);
    } finally { URL.revokeObjectURL(url); }
  }

  async function finish(p, { full, cut, mode }) {
    busyMsg(p, 'Uploading…');
    const thumb = fit(full, THUMB);
    const [fullUrl, thumbUrl, cutUrl] = await Promise.all([up(await toBlob(full, 'image/webp', 0.9), 'full'),
      up(await toBlob(thumb, 'image/webp', 0.85), 'thumb'), cut ? up(await toBlob(cut, 'image/png'), 'cut') : null]);
    Object.assign(p, { full: fullUrl, thumb: thumbUrl, mode });
    if (cutUrl) p.cut = cutUrl;
    if (mode === 'clean') p.scene = sceneSelect.value || undefined; else delete p.scene;
  }

  async function processNew(file, p) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { bmp = await loadImage(p.preview); }
    const src = fit(bmp, 2000);
    busyMsg(p, 'Saving the original…');
    p.orig = await up(await toBlob(src, 'image/jpeg', 0.9), 'orig');
    let cut = null;
    if (auto.checked) {
      try { cut = await cutout(src, p); if (!cut) toast('Couldn’t find a clear product in one photo, so it was kept as is.'); }
      catch (err) { console.warn(err); toast(`Clean-up isn’t available in this browser right now (${err.message}). Kept the original.`, true); }
    }
    await finish(p, cut ? { full: compose(cut, await scene()), cut, mode: 'clean' } : { full: squareCrop(src), mode: 'original' });
    URL.revokeObjectURL(p.preview);
  }
  async function reclean(p) {
    const src = fit(await loadImage(p.orig), 2000), cut = await cutout(src, p);
    if (!cut) throw new Error('Couldn’t find a clear product in this photo.');
    await finish(p, { full: compose(cut, await scene()), cut, mode: 'clean' });
  }
  async function useOriginal(p) { await finish(p, { full: squareCrop(await loadImage(p.orig)), mode: 'original' }); }
  async function replace(p) {
    busyMsg(p, 'Placing on the backdrop…');
    await finish(p, { full: compose(await loadImage(p.cut), await scene()), mode: 'clean' });
  }

  function addFiles(files) {
    const list = [...files].filter(f => f.type.startsWith('image/'));
    const room = MAX_PHOTOS - photos.length;
    if (list.length > room) toast(`Up to ${MAX_PHOTOS} photos per product. Added the first ${Math.max(room, 0)}.`, true);
    for (const file of list.slice(0, Math.max(room, 0))) {
      const p = { busy: true, msg: 'Waiting…', preview: URL.createObjectURL(file) };
      photos.push(p);
      render();
      const job = queue.then(() => processNew(file, p));
      queue = job.then(() => { delete p.busy; }, err => { photos.splice(photos.indexOf(p), 1); toast(err.message || String(err), true); })
        .then(() => { sync(); render(); setStatus(photos.some(x => x.busy) ? 'Working…' : 'All photos are ready.'); });
    }
    setStatus('Working…');
  }

  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  form.addEventListener('submit', e => {
    if (photos.some(p => p.busy)) { e.preventDefault(); toast('Photos are still processing. Save again in a moment.', true); }
  });
  render();
}
