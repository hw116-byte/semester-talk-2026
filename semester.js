// Every neuron · deck V2. Stage scaling, the footer, page turning and the 3D view switch.
// Sources and assumptions for the numbers are in START_HERE.md.
(() => {
  const $ = id => document.getElementById(id);

  // ---- stage: one 1600 × 900 slide, scaled to the window
  const stage = $('stage'), foot = $('foot'), counter = $('counter');
  stage.appendChild(foot); foot.appendChild(counter);
  Object.assign(foot.style, { position: 'absolute', left: '88px', right: '88px', bottom: '34px', alignItems: 'center' });
  Object.assign(counter.style, { position: 'static', marginLeft: '14px' });
  const fit = () => { stage.style.transform = `translate(-50%,-50%) scale(${Math.min(innerWidth / 1600, innerHeight / 900)})`; };
  addEventListener('resize', fit); fit();
  const slides = [...document.querySelectorAll('.slide')], segs = [...foot.querySelectorAll('i')];
  const mark = () => {
    const s = slides.find(x => x.classList.contains('active')) || slides[0], sec = Number(s.dataset.sec || 0);
    segs.forEach((el, i) => el.classList.toggle('on', i + 1 === sec));
    document.body.classList.toggle('is-cover', s.classList.contains('cover'));
    // the page number counts the talk only; slides after the divider are numbered as backup
    const end = slides.findIndex(x => x.hasAttribute('data-backup-start')), i = slides.indexOf(s);
    if (end > 0) counter.textContent = i < end ? `${i + 1} / ${end}` : i === end ? '' : `backup ${i - end}`;
  };
  new MutationObserver(mark).observe(stage, { subtree: true, attributes: true, attributeFilter: ['class'] }); mark();
  // turn pages by clicking the left or right edge of the slide (works even when a 3D view has taken the keyboard)
  [['prev', 'left'], ['next', 'right']].forEach(([id, side]) => {
    const z = document.createElement('button'); z.className = 'edge ' + side; z.setAttribute('aria-label', id === 'next' ? 'Next slide' : 'Previous slide');
    z.onclick = () => { $(id).click(); z.blur(); }; stage.appendChild(z);
  });
  addEventListener('keydown', e => { if (e.key === 'f' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) $('full').click(); });

  // ---- 3D overview: whole system, or the heads on the animal
  const seg = $('approach'), frame = $('overview-frame');
  if (seg && frame) {
    let want = 'custom';
    const post = () => frame.contentWindow && frame.contentWindow.postMessage({ type: 'overview-set-approach', value: want }, location.origin);
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { want = b.dataset.approach; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); post(); });
    addEventListener('message', e => { if (e.origin === location.origin && e.source === frame.contentWindow && (e.data || {}).type === 'overview-hello') post(); });
  }

  // ---- slides shown in steps: [data-steps] holds stacked frames; → shows the next one before the page turns
  const stepsOf = s => s && s.querySelector('[data-steps]');
  const setStep = (box, k) => { box.dataset.step = k; [...box.children].forEach((el, i) => el.classList.toggle('on', i <= k)); };
  const active = () => slides.find(x => x.classList.contains('active'));
  const step = d => {
    const box = stepsOf(active()); if (!box) return false;
    const k = Number(box.dataset.step || 0) + d;
    if (k < 0 || k >= box.children.length) return false;
    setStep(box, k); return true;
  };
  const ALL = new URLSearchParams(location.search).has('all');   // index.html?all shows every slide complete (for printing and overviews)
  if (ALL && stepsOf(active())) setStep(stepsOf(active()), stepsOf(active()).children.length - 1);
  let was = slides.indexOf(active());
  new MutationObserver(() => {
    const now = slides.indexOf(active()); if (now === was || now < 0) return;
    const box = stepsOf(slides[now]); if (box) setStep(box, (ALL || now < was) ? box.children.length - 1 : 0);   // coming back: start from the last frame
    was = now;
  }).observe(stage, { subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('keydown', e => {
    if (document.getElementById('zoom')) return;
    const d = ['ArrowRight', 'PageDown', ' '].includes(e.key) ? 1 : ['ArrowLeft', 'PageUp'].includes(e.key) ? -1 : 0;
    if (d && step(d)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  ['prev', 'next'].forEach(id => { const b = $(id), turn = b.onclick; b.onclick = () => { if (!step(id === 'next' ? 1 : -1)) turn(); }; });

  // every plot and illustration is a matplotlib figure: plots/make_plots.py -> assets/plots/*.svg
})();
