// 계산기 대화상자. 계산 로직은 lib/calc.js(eval 없음, 연산 우선순위, 원 단위 반올림).
// - mode 'amount': 금액 칸에서 연 계산기. '=' 을 누르면 결과를 바로 그 금액 칸에 넣음(onApply). '완료'는 남은 식까지 넣고 닫음.
// - mode 'free'  : 아래 독·'더' 메뉴에서 연 계산기. 결과를 복사하거나 '이 금액으로 기록'(onRecord).
// - 휴대폰 뒤로 가기·Esc·바깥 누르기로 닫힘(확인 창과 같은 히스토리, util.attachModal).
// - 키보드: 숫자 · + - * / x · Enter/= · Backspace · Delete/C(모두 지우기) · 붙여넣기.
import { esc, haptic, attachModal } from './util.js';
import { press, calcWon, formatExpr, speakExpr, exprFromWon, exprFromText, normalizeOp, ERRORS } from '../lib/calc.js';

const KEYS = [
  ['C', '모두 지우기', 'fn'], ['÷', '나누기', 'op'], ['×', '곱하기', 'op'], ['⌫', '한 글자 지우기', 'fn'],
  ['7'], ['8'], ['9'], ['−', '빼기', 'op'],
  ['4'], ['5'], ['6'], ['+', '더하기', 'op'],
  ['1'], ['2'], ['3'], ['=', '계산', 'eq'],
  ['00'], ['0'], ['.', '소수점'],
];
const hasOp = (expr) => /[+−×÷]/.test(expr.replace(/^−/, ''));
const won = (n) => `${n.toLocaleString('ko-KR')}원`;

let openNow = null;
export const isCalcOpen = () => !!openNow;

/**
 * @param {{ mode?: 'amount'|'free', value?: number, start?: string, title?: string,
 *           onApply?: (won:number) => string|null, onRecord?: (won:number) => void }} opt
 * @returns {Promise<void>} 닫히면 끝남
 */
export function openCalc({ mode = 'free', value = 0, start = '', title = '계산기', onApply, onRecord } = {}) {
  if (openNow) return openNow;
  openNow = new Promise((resolve) => {
    let st = { expr: exprFromWon(value), fresh: !!value };
    if (start) st = press({ expr: st.expr, fresh: false }, start);
    let last = null; // 마지막 = 결과 { won, from }
    let applied = false;
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[70] dlg-wrap calc-wrap p-4 fade-in';
    wrap.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="calc-t" class="dlg-card calc-card" tabindex="-1">
      <div class="calc-head"><h2 id="calc-t">${esc(title)}</h2><button type="button" class="icon-btn calc-x" data-calc-close aria-label="계산기 닫기">✕</button></div>
      <div class="calc-screen">
        <p class="calc-sub tabular-nums" data-calc-sub aria-hidden="true"></p>
        <p class="calc-main tabular-nums" data-calc-main></p>
        <p class="sr-only" data-calc-say aria-live="polite"></p>
        <p class="calc-msg" data-calc-msg role="status"></p>
      </div>
      <div class="calc-keys" role="group" aria-label="계산기 자판">
        ${KEYS.map(([k, name, kind]) => `<button type="button" class="calc-key${kind ? ` is-${kind}` : ''}" data-ck="${esc(k)}" ${name ? `aria-label="${esc(name)}"` : ''}>${k === '⌫' ? '⌫' : esc(k)}</button>`).join('')}
      </div>
      <div class="dlg-actions">
        ${mode === 'amount'
          ? '<button type="button" class="btn-ghost" data-calc-close>닫기</button><button type="button" class="btn-primary" data-calc-done>금액에 넣고 닫기</button>'
          : '<button type="button" class="btn-ghost" data-calc-copy>결과 복사</button><button type="button" class="btn-primary" data-calc-record>이 금액으로 기록</button>'}
      </div>
      <p class="calc-more" data-calc-more aria-hidden="true"><span>아래로 밀면 더 있어요</span><span class="calc-more-arrow">↓</span></p></div>`;
    const card = wrap.querySelector('.calc-card');
    const $ = (s) => wrap.querySelector(s);
    const app = document.getElementById('app');
    const wasInert = app?.inert ?? false;
    const back = document.activeElement;
    // 아주 낮은 화면(가로 + 글자 크게 등)에서만 카드 안이 스크롤됨 → 아래에 '더 있어요' 표시
    const fit = () => {
      const more = card.scrollHeight - card.clientHeight - card.scrollTop > 4;
      card.classList.toggle('can-scroll', more);
    };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    const done = attachModal(() => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
      wrap.remove();
      if (app) app.inert = wasInert;
      openNow = null;
      back?.isConnected && back.focus?.({ preventScroll: true });
      resolve();
    });
    if (app) app.inert = true;

    const setMsg = (text, bad = false) => { const m = $('[data-calc-msg]'); m.textContent = text; m.classList.toggle('is-bad', bad); };
    const paint = () => {
      const main = $('[data-calc-main]'), sub = $('[data-calc-sub]');
      const shown = st.expr ? formatExpr(st.expr) : '0';
      main.textContent = shown;
      main.dataset.len = shown.length > 22 ? 'xl' : shown.length > 13 ? 'l' : '';
      if (st.fresh && last) sub.textContent = `${formatExpr(last.from)} =`;
      else if (hasOp(st.expr)) { const r = calcWon(st.expr); sub.textContent = r.ok ? `= ${won(r.won)}` : ''; }
      else sub.textContent = '';
      $('[data-calc-say]').textContent = st.fresh && last ? `결과 ${won(last.won)}` : '';
      const rec = $('[data-calc-record]');
      if (rec) { const r = calcWon(st.expr); rec.setAttribute('aria-disabled', String(!(r.ok && r.won > 0 && r.won <= 1_000_000_000))); }
    };
    const equals = () => {
      if (!hasOp(st.expr) && st.fresh) return last; // 이미 결과
      const r = calcWon(st.expr);
      if (!r.ok) { if (r.error !== 'empty') setMsg(ERRORS[r.error], true); return null; }
      last = { won: r.won, from: st.expr };
      st = { expr: exprFromWon(r.won) || '0', fresh: true };
      setMsg('');
      if (mode === 'amount' && onApply) {
        const err = onApply(r.won);
        if (err) setMsg(err, true); else { applied = true; setMsg(`✓ 금액 칸에 ${won(r.won)}을 넣었어요.`); }
      }
      return last;
    };
    const key = (k) => {
      haptic(6);
      if (k === '=') { equals(); paint(); return; }
      applied = false;
      setMsg('');
      st = press(st, k);
      paint();
    };
    const finish = () => {
      if (!st.expr || st.expr === '−' || (st.fresh && (applied || !last))) return done();
      if (st.fresh) return; // 마지막 결과를 넣지 못함(0원 이하·한도 넘음): 이유를 보여 주고 열어 둠
      const r = equals();
      paint();
      if (r && applied) done();
    };
    const result = () => { const r = calcWon(st.expr); return r.ok ? r.won : null; };

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return done();
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ck) return key(b.dataset.ck);
      if (b.hasAttribute('data-calc-close')) return done();
      if (b.hasAttribute('data-calc-done')) return finish();
      if (b.hasAttribute('data-calc-copy')) {
        if (hasOp(st.expr)) { equals(); paint(); }
        const n = result();
        if (n == null) return setMsg('복사할 결과가 없어요.', true);
        navigator.clipboard?.writeText(String(n)).then(() => setMsg(`${won(n)}을 복사했어요.`), () => setMsg('복사하지 못했어요. 숫자를 길게 눌러 복사해 주세요.', true));
        return;
      }
      if (b.hasAttribute('data-calc-record')) {
        if (hasOp(st.expr)) { equals(); paint(); }
        const n = result();
        if (n == null || n <= 0) return setMsg('0원보다 큰 결과만 기록할 수 있어요.', true);
        if (n > 1_000_000_000) return setMsg('한 번에 10억 원까지 기록할 수 있어요.', true);
        done();
        onRecord?.(n);
      }
    });
    wrap.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 뒤의 기록 시트·대화상자가 같은 키를 받지 않게
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); return done(); }
      if (e.key === 'Tab') {
        const f = [...card.querySelectorAll('button:not([disabled])')];
        const first = f[0], lastB = f.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); lastB.focus(); }
        else if (!e.shiftKey && document.activeElement === lastB) { e.preventDefault(); first.focus(); }
        return;
      }
      const onAction = e.target.closest?.('.dlg-actions, .calc-head');
      if ((e.key === 'Enter' || e.key === ' ') && onAction) return; // 아래 버튼은 그 버튼대로
      let k = null;
      if (/^[0-9]$/.test(e.key)) k = e.key;
      else if (e.key === 'Enter' || e.key === '=') k = '=';
      else if (e.key === 'Backspace') k = '⌫';
      else if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') k = 'C';
      else if (e.key === '.' || e.key === ',') k = '.';
      else if (normalizeOp(e.key)) k = normalizeOp(e.key);
      if (!k) return;
      e.preventDefault();
      key(k);
      const b = wrap.querySelector(`[data-ck="${CSS.escape(k)}"]`);
      if (b) { b.classList.add('is-hit'); setTimeout(() => b.classList.remove('is-hit'), 120); }
    });
    wrap.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') ?? '';
      const expr = exprFromText(text);
      if (!expr) return;
      e.preventDefault();
      st = { expr, fresh: false };
      setMsg('');
      paint();
    });
    card.addEventListener('scroll', fit, { passive: true });
    window.addEventListener('resize', fit);
    document.body.append(wrap);
    paint();
    ro?.observe(card);
    fit();
    card.focus({ preventScroll: true });
  });
  return openNow;
}
