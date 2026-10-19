export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const haptic = (ms = 8) => { if (localStorage.getItem('haptic') !== 'off') navigator.vibrate?.(ms); };

// 숫자 롤링(카운트업) — 420ms, reduced-motion 이면 즉시
export function rollNumber(el, to, format, from = Number(el.dataset.value ?? 0)) {
  el.dataset.value = to;
  if (reducedMotion() || from === to) { el.textContent = format(to); return; }
  const t0 = performance.now(), dur = 420, ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    el.textContent = format(Math.round(from + (to - from) * ease(t)));
    if (t < 1 && el.dataset.value == to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// 가벼운 확인 대화상자 (alert/confirm 대체)
export function confirmDialog({ title, body = '', ok = '확인', cancel = '취소', danger = false, typeToConfirm = '' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[70] grid place-items-center bg-black/40 p-6 fade-in';
    wrap.innerHTML = `<div role="alertdialog" aria-modal="true" aria-labelledby="cd-t" class="w-full max-w-sm rounded-lg bg-surface-solid p-5 shadow-glass">
      <h2 id="cd-t" class="text-head">${esc(title)}</h2>${body ? `<p class="mt-2 text-body text-ink-sub">${esc(body)}</p>` : ''}
      ${typeToConfirm ? `<label class="mt-4 block text-caption text-ink-sub">계속하려면 <b class="text-ink">${esc(typeToConfirm)}</b>를 입력하세요<input data-type class="mt-1 w-full min-h-[44px] px-3 rounded-xl border bg-transparent text-body" style="border-color:var(--line)" autocomplete="off" /></label>` : ''}
      <div class="mt-5 flex gap-2 justify-end">
        ${cancel ? `<button class="btn-ghost" data-v="0">${esc(cancel)}</button>` : ''}
        <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-v="1" ${typeToConfirm ? 'disabled' : ''}>${esc(ok)}</button></div></div>`;
    const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => e.key === 'Escape' && done(false);
    wrap.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b && !b.disabled) done(b.dataset.v === '1'); else if (e.target === wrap) done(false); });
    document.addEventListener('keydown', onKey);
    document.body.append(wrap);
    const typed = wrap.querySelector('[data-type]');
    if (typed) { typed.addEventListener('input', () => { wrap.querySelector('[data-v="1"]').disabled = typed.value.trim() !== typeToConfirm; }); typed.focus(); }
    else wrap.querySelector('[data-v="1"]').focus();
  });
}

let toastTimer;
export function toast(msg, { action, onAction, duration = 3500 } = {}) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.append(el); }
  el.className = 'toast show';
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); onAction?.(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? Math.max(duration, 5000) : duration);
}

// 금액 입력 대화상자 (예산 등). 숫자만 남김. 취소 시 null
export function promptAmount({ title, body = '', value = 0, ok = '저장' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[70] grid place-items-center bg-black/40 p-6 fade-in';
    wrap.innerHTML = `<form role="dialog" aria-modal="true" aria-labelledby="pa-t" class="w-full max-w-sm rounded-lg bg-surface-solid p-5 shadow-glass">
      <h2 id="pa-t" class="text-head">${esc(title)}</h2>${body ? `<p class="mt-1 text-caption text-ink-sub">${esc(body)}</p>` : ''}
      <label class="mt-4 flex items-center gap-2 rounded-md border border-line bg-bg px-4 h-14 focus-within:ring-2 focus-within:ring-primary">
        <input inputmode="numeric" autocomplete="off" aria-label="금액" class="w-full bg-transparent text-title tabular-nums text-right outline-none" value="${value ? value.toLocaleString('ko-KR') : ''}" placeholder="0" />
        <span class="text-head">원</span></label>
      <p class="mt-1 h-5 text-caption text-expense" role="alert"></p>
      <div class="mt-3 flex gap-2 justify-end"><button type="button" class="btn-ghost" data-cancel>취소</button><button class="btn-primary">${esc(ok)}</button></div></form>`;
    const input = wrap.querySelector('input'), err = wrap.querySelector('[role=alert]');
    const done = (v) => { wrap.remove(); resolve(v); };
    input.addEventListener('input', () => {
      const d = input.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
      input.value = d ? Number(d).toLocaleString('ko-KR') : '';
    });
    wrap.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = Number(input.value.replace(/[^0-9]/g, '') || 0);
      if (n > 100_000_000_000) { err.textContent = '1,000억 원까지 입력할 수 있어요.'; return; }
      done(n);
    });
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-cancel]')) done(null); });
    wrap.addEventListener('keydown', (e) => e.key === 'Escape' && done(null));
    document.body.append(wrap);
    input.focus(); input.select();
  });
}
