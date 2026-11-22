(() => {
  const slides = [...document.querySelectorAll('.slide')];
  const note = document.querySelector('#speaker'), noteBtn = document.querySelector('#notes');
  let current = 0;
  function frames(slide, live) {
    slide.querySelectorAll('iframe').forEach(f => {
      const inPanel = f.closest('.panel');
      const on = live && (!inPanel || inPanel.classList.contains('active'));
      if (on && !f.getAttribute('src') && f.dataset.src) f.src = f.dataset.src;
      if (!on && f.getAttribute('src')) { f.dataset.src = f.getAttribute('src'); f.removeAttribute('src'); }
    });
  }
  function show(n) {
    current = Math.max(0, Math.min(slides.length - 1, n));
    closeZoom(); slides.forEach((s, i) => { s.classList.toggle('active', i === current); frames(s, i === current); });
    document.querySelector('#counter').textContent = `${current + 1} / ${slides.length}`;
    document.querySelector('#prev').disabled = current === 0;
    document.querySelector('#next').disabled = current === slides.length - 1;
    note.querySelector('p').textContent = slides[current].dataset.notes || '';
    history.replaceState(null, '', `#slide-${current + 1}`);
  }
  // V10: click a picture to zoom (wheel or pinch to zoom, drag to pan, double-click 2.5x, arrows for the next picture, Esc to close)
  const zoomImgs = () => [...slides[current].querySelectorAll('img[data-zoom]')];
  let Z = null;
  function openZoom(img) {
    closeZoom();
    const box = document.createElement('div'); box.id = 'zoom';
    box.innerHTML = '<div class="zbar"><button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button><button data-z="fit">Fit</button><button data-z="close">Close ✕</button></div><img alt=""><div class="zcap"></div>';
    document.body.appendChild(box);
    const im = box.querySelector('img'), st = { s: 1, x: 0, y: 0, fit: 1 }, pts = new Map(); let last = null, pinch = null;
    const apply = () => { im.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`; };
    const fit = () => { const W = box.clientWidth, H = box.clientHeight, w = im.naturalWidth, h = im.naturalHeight; st.fit = st.s = Math.min(W / w, H / h); st.x = (W - w * st.s) / 2; st.y = (H - h * st.s) / 2; apply(); };
    const zoomAt = (k, cx, cy) => { const ns = Math.min(Math.max(st.s * k, st.fit * 0.5), st.fit * 40); st.x = cx - (cx - st.x) * ns / st.s; st.y = cy - (cy - st.y) * ns / st.s; st.s = ns; apply(); };
    const show = el => { Z.el = el; im.src = el.currentSrc || el.src; box.querySelector('.zcap').textContent = (el.closest('figure')?.querySelector('figcaption')?.textContent) || el.alt || ''; if (im.complete) fit(); };
    im.onload = fit;
    box.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    im.addEventListener('dblclick', e => zoomAt(st.s > st.fit * 1.5 ? st.fit / st.s : 2.5, e.clientX, e.clientY));
    box.addEventListener('pointerdown', e => { if (e.target.closest('.zbar')) return; box.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; im.classList.add('drag'); });
    box.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (pinch) zoomAt(d / pinch, c[0], c[1]); pinch = d; return; }
      st.x += e.clientX - last[0]; st.y += e.clientY - last[1]; last = [e.clientX, e.clientY]; apply();
    });
    const up = e => { pts.delete(e.pointerId); pinch = null; if (pts.size) last = [...pts.values()][0]; else im.classList.remove('drag'); };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.querySelector('.zbar').onclick = e => { const k = e.target.dataset.z, r = box.getBoundingClientRect(); if (k === 'close') closeZoom(); if (k === 'fit') fit(); if (k === 'in') zoomAt(1.5, r.width / 2, r.height / 2); if (k === 'out') zoomAt(1 / 1.5, r.width / 2, r.height / 2); };
    Z = { box, show, fit }; show(img);
    window.addEventListener('resize', fit);
  }
  function closeZoom() { if (Z) { window.removeEventListener('resize', Z.fit); Z.box.remove(); Z = null; } }
  document.addEventListener('click', e => { const img = e.target.closest('img[data-zoom]'); if (img && !Z) openZoom(img); });
  document.addEventListener('keydown', e => {
    if (!Z) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.key === 'Escape') closeZoom();
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const l = zoomImgs(), i = l.indexOf(Z.el); if (l.length) Z.show(l[(i + (e.key === 'ArrowRight' ? 1 : l.length - 1)) % l.length]); }
  }, true);
  document.querySelector('#prev').onclick = () => show(current - 1);
  document.querySelector('#next').onclick = () => show(current + 1);
  noteBtn.onclick = () => { note.hidden = !note.hidden; noteBtn.setAttribute('aria-pressed', String(!note.hidden)); };
  document.querySelector('#full').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(current + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(current - 1); }
    if (e.key === 'n') noteBtn.click();
  });
  // tab switches inside a slide
  document.querySelectorAll('.switch').forEach(group => group.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    const slide = group.closest('.slide');
    group.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    slide.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === btn.dataset.view));
    frames(slide, true);
  }));
  // 3D overview: zoom to the ASIC boards once the viewer says hello
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || (e.data || {}).type !== 'overview-hello') return;
    const f = [...document.querySelectorAll('iframe[data-focus]')].find(x => x.contentWindow === e.source);
    if (!f) return;
    e.source.postMessage({ type: 'overview-set-approach', value: 'custom' }, location.origin);
    setTimeout(() => e.source.postMessage({ type: 'overview-focus', key: f.dataset.focus }, location.origin), 600);
  });
  document.querySelectorAll('a[href^="#slide-"]').forEach(a => a.onclick = ev => { ev.preventDefault(); show(Number(a.getAttribute('href').slice(7)) - 1); });
  const fromHash = () => show((Number(location.hash.replace('#slide-', '')) || 1) - 1);
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
