export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const haptic = (ms = 8) => { if (localStorage.getItem('haptic') !== 'off') navigator.vibrate?.(ms); };

// 문장 속 금액: 숫자 폭을 고르게(tabular-nums) + 금액 중간에서 줄이 갈리지 않게
export const numSpan = (txt) => `<span data-fit class="num tabular-nums">${txt}</span>`;

// 큰 금액 한 줄 맞춤: 금액은 자르거나(…) 쪼개지 않고, 칸보다 넓을 때만 글자를 조금씩 줄여 칸 안에 다 보이게(최소 55%)
export function fitNum(el) {
  if (!el || !el.isConnected) return;
  el.style.fontSize = '';
  const base = parseFloat(getComputedStyle(el).fontSize);
  // 가운데 정렬(flex items-center 등)로 상자 자체가 부모보다 넓어지는 경우도 넘침으로 봄
  // 문장 속 금액(inline)은 자기 폭이 없으니(clientWidth 0) 부모 폭만 봄 → 한 줄을 통째로 차지해도 넘칠 때만 줄임
  const par = el.parentElement, ps = par && getComputedStyle(par);
  const room = () => Math.min(el.clientWidth || Infinity, par ? par.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight) : Infinity);
  const need = () => Math.max(el.scrollWidth, el.getBoundingClientRect().width);
  for (let k = 1; k <= 9 && need() > room() + 0.5; k++) el.style.fontSize = `${base * (1 - k * 0.05)}px`;
}
export const fitNums = (root = document) => $$('[data-fit]', root).forEach(fitNum);

// 숫자 롤링(카운트업) — 420ms, reduced-motion 이면 즉시
export function rollNumber(el, to, format, from = Number(el.dataset.value ?? 0)) {
  el.dataset.value = to;
  if (reducedMotion() || from === to) { el.textContent = format(to); fitNum(el); return; }
  const t0 = performance.now(), dur = 420, ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    el.textContent = format(Math.round(from + (to - from) * ease(t)));
    if (t < 1 && el.dataset.value == to) requestAnimationFrame(step);
    else if (t >= 1) fitNum(el);
  };
  requestAnimationFrame(step);
}

// 가벼운 확인 대화상자 (alert/confirm 대체)
export function confirmDialog({ title, body = '', ok = '확인', cancel = '취소', danger = false, typeToConfirm = '' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[70] dlg-wrap bg-black/40 p-6 fade-in';
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
    wrap.className = 'fixed inset-0 z-[70] dlg-wrap bg-black/40 p-6 fade-in';
    wrap.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="pa-t" class="w-full max-w-sm rounded-lg bg-surface-solid p-5 shadow-glass"><form>
      <h2 id="pa-t" class="text-head">${esc(title)}</h2>${body ? `<p class="mt-1 text-caption text-ink-sub">${esc(body)}</p>` : ''}
      <label class="mt-4 flex items-center gap-2 rounded-md border border-line bg-bg px-4 h-14 focus-within:ring-2 focus-within:ring-primary">
        <input inputmode="numeric" autocomplete="off" aria-label="금액" class="w-full bg-transparent text-title tabular-nums text-right outline-none" value="${value ? value.toLocaleString('ko-KR') : ''}" placeholder="0" />
        <span class="text-head">원</span></label>
      <p class="mt-1 h-5 text-caption text-expense" role="alert"></p>
      <div class="mt-3 flex gap-2 justify-end"><button type="button" class="btn-ghost" data-cancel>취소</button><button class="btn-primary">${esc(ok)}</button></div></form></div>`;
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

/**
 * 여러 칸 입력 대화상자(반복 거래·저축 목표·규칙). 취소 시 null
 * fields: [{ name, label, type: 'text'|'amount'|'select'|'date'|'day', value, options: [[v,l]], maxlength, hint }]
 * validate(values) → 오류 문구 또는 null
 */
export function formDialog({ title, body = '', fields, ok = '저장', validate = () => null }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[70] dlg-wrap bg-black/40 p-4 fade-in';
    const inputCls = 'mt-1 w-full min-h-[44px] px-3 rounded-xl border bg-transparent text-body';
    const field = (f) => {
      const id = `fd-${f.name}`;
      let ctrl;
      if (f.type === 'select') ctrl = `<select id="${id}" name="${f.name}" class="select w-full mt-1">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(f.value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      else if (f.type === 'amount') ctrl = `<div class="mt-1 flex items-center gap-2 rounded-xl border px-3 min-h-[44px]" style="border-color:var(--line)"><input id="${id}" name="${f.name}" data-amount inputmode="numeric" autocomplete="off" class="w-full bg-transparent text-body tabular-nums text-right outline-none min-h-[44px]" value="${f.value ? Number(f.value).toLocaleString('ko-KR') : ''}" placeholder="0" /><span>원</span></div>`;
      else if (f.type === 'checkbox') return `<label class="flex items-center justify-between gap-2 text-body min-h-[44px]">${esc(f.label)}<span class="switch"><input type="checkbox" id="${id}" name="${f.name}" ${f.value ? 'checked' : ''} /><span></span></span></label>`;
      else ctrl = `<input id="${id}" name="${f.name}" type="${f.type === 'date' ? 'date' : 'text'}" class="${inputCls}" style="border-color:var(--line)" value="${esc(f.value ?? '')}" ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} autocomplete="off" />`;
      return `<div><label for="${id}" class="text-caption text-ink-sub">${esc(f.label)}</label>${ctrl}${f.hint ? `<p class="mt-1 text-caption text-ink-sub">${esc(f.hint)}</p>` : ''}</div>`;
    };
    wrap.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="fd-t" class="w-full max-w-sm rounded-lg bg-surface-solid p-5 shadow-glass my-auto"><form>
      <h2 id="fd-t" class="text-head">${esc(title)}</h2>${body ? `<p class="mt-1 text-caption text-ink-sub">${esc(body)}</p>` : ''}
      <div class="mt-4 flex flex-col gap-3">${fields.map(field).join('')}</div>
      <p class="mt-2 min-h-5 text-caption text-expense" role="alert"></p>
      <div class="mt-3 flex gap-2 justify-end"><button type="button" class="btn-ghost" data-cancel>취소</button><button class="btn-primary">${esc(ok)}</button></div></form></div>`;
    const form = wrap.querySelector('form'), err = wrap.querySelector('[role=alert]');
    const app = document.getElementById('app'), back = document.activeElement;
    const done = (v) => { wrap.remove(); if (app) app.inert = false; back?.focus?.(); resolve(v); };
    if (app) app.inert = true; // 대화상자 뒤 화면은 잠금(포커스·스크린리더가 뒤로 새지 않게)
    form.querySelectorAll('[data-amount]').forEach((input) => input.addEventListener('input', () => {
      const d = input.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
      input.value = d ? Number(d).toLocaleString('ko-KR') : '';
    }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = {};
      for (const f of fields) {
        const el = form.elements[f.name];
        v[f.name] = f.type === 'amount' ? Number(el.value.replace(/[^0-9]/g, '') || 0) : f.type === 'checkbox' ? el.checked : f.type === 'day' ? Number(el.value) : el.value.trim();
      }
      const msg = validate(v);
      if (msg) { err.textContent = msg; return; }
      done(v);
    });
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-cancel]')) done(null); });
    wrap.addEventListener('keydown', (e) => e.key === 'Escape' && done(null));
    document.body.append(wrap);
    form.querySelector('input,select')?.focus();
  });
}
