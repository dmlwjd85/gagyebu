// 카드사·은행 파일 가져오기 (design-spec 11·13절): ① 파일 ② 열 맞추기 ③ 중복 확인 ④ 확정 → 완료
// 파일은 이 기기 메모리에서만 읽고, 원본은 어디에도 저장하지 않는다(가져오기를 마치거나 나가면 버림).
import { esc } from './util.js';
import { formatWon, signedWon } from '../lib/money.js';
import { readTable } from '../lib/import/read.js';
import { detectHeaderRow, detectPreset, guessMapping, missingRoles, headerSignature, ROLES, ROLE_LABEL, PRESETS } from '../lib/import/mapping.js';
import { toCandidates, summarize } from '../lib/import/transform.js';
import { excelSerialToYmd } from '../lib/import/normalize.js';
import { findDuplicates } from '../lib/import/dedupe.js';
import { classify } from '../lib/classify.js';

const MAPS_KEY = 'importMaps'; // 이 맞춤 기억하기: 열 이름 서명 → 열 용도(개인정보 없음)
const LAST_KEY = 'lastImport'; // 24시간 되돌리기용 { id, at, count }
const loadMaps = () => { try { return JSON.parse(localStorage.getItem(MAPS_KEY)) || {}; } catch { return {}; } };
export const lastImport = () => {
  try { const l = JSON.parse(localStorage.getItem(LAST_KEY)); return l && Date.now() - l.at < 86400000 ? l : null; } catch { return null; }
};
export const clearLastImport = () => localStorage.removeItem(LAST_KEY);
export const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/${encodeURIComponent('현대카드_예시.xls')}`;

export const newImport = () => ({ step: 1, busy: false, error: '', fileName: '', bytes: null, table: null, sheet: 0, headerRow: 0, cols: [], auto: [], opts: { sign: 'expense', excludeCancelled: true, remember: true, accountId: '' }, dup: null, choice: {}, result: null });

/** 파일 바이트 → 표 읽기 → 머리글·열 자동 추정 */
export async function loadFile(imp, bytes, fileName, encoding = 'auto') {
  Object.assign(imp, { busy: true, error: '', fileName, bytes });
  try {
    imp.table = await readTable(bytes, fileName, { encoding });
    if (!imp.table.sheets.length) throw new Error('empty');
    imp.sheet = 0;
    setSheet(imp, 0);
    imp.step = 2;
  } catch (e) {
    console.error(e);
    imp.error = "이 파일은 읽을 수 없었어요. 엑셀에서 'CSV(쉼표로 분리)'로 다시 저장해 보세요.";
  }
  imp.busy = false;
}
export function setSheet(imp, i) {
  imp.sheet = i;
  setHeaderRow(imp, detectHeaderRow(imp.table.sheets[i].rows));
}
export function setHeaderRow(imp, h) {
  const rows = imp.table.sheets[imp.sheet].rows;
  imp.headerRow = Math.max(0, Math.min(rows.length - 1, h));
  const header = headerOf(imp);
  const saved = loadMaps()[headerSignature(header)];
  const g = guessMapping(header);
  imp.cols = saved?.cols?.length === header.length ? [...saved.cols] : g.cols;
  imp.auto = imp.cols.map((c, i) => c !== 'ignore' && c === g.cols[i]);
  imp.remembered = Boolean(saved);
  if (saved?.opts) Object.assign(imp.opts, saved.opts);
  imp.preset = detectPreset(header);
}
const headerOf = (imp) => (imp.table.sheets[imp.sheet].rows[imp.headerRow] || []).map((v) => String(v ?? ''));
const dataRows = (imp) => imp.table.sheets[imp.sheet].rows.slice(imp.headerRow + 1);
export function setCol(imp, i, role) {
  // 같은 용도는 한 열만: 다른 열에 있던 같은 용도는 '무시'로
  if (role !== 'ignore') imp.cols = imp.cols.map((c, j) => (j !== i && c === role ? 'ignore' : c));
  imp.cols[i] = role; imp.auto[i] = false;
}

/** 열 맞춤 → 우리 형식 후보 + 자동 분류 */
export function candidates(imp, ctx) {
  const { items, cancelled, invalid } = toCandidates(dataRows(imp), { cols: imp.cols }, imp.opts);
  const valid = new Set(ctx.categories.map((c) => c.id));
  for (const it of items) {
    const c = classify(it, ctx.rules, valid);
    it.categoryId = c.categoryId; it.by = c.by;
    if (imp.opts.accountId) it.accountId = imp.opts.accountId;
  }
  return { items, cancelled, invalid };
}

/** ② → ③: 기존 기록과 비교 */
export async function checkDuplicates(imp, ctx) {
  imp.busy = true; imp.error = '';
  try {
    const c = candidates(imp, ctx);
    const s = summarize(c.items);
    const existing = s.count ? await ctx.txsInRange(s.from, s.to) : [];
    imp.dup = { ...findDuplicates(c.items, existing), cancelled: c.cancelled, invalid: c.invalid };
    imp.choice = {};
    if (imp.opts.remember) {
      const maps = loadMaps();
      maps[headerSignature(headerOf(imp))] = { cols: imp.cols, opts: { sign: imp.opts.sign, excludeCancelled: imp.opts.excludeCancelled } };
      localStorage.setItem(MAPS_KEY, JSON.stringify(maps));
    }
    imp.step = 3;
  } catch (e) {
    console.error(e);
    imp.error = '기존 기록과 비교하지 못했어요. 인터넷 연결을 확인해 주세요.';
  }
  imp.busy = false;
}
export const toImport = (imp) => [...imp.dup.fresh, ...imp.dup.suspect.filter((_, i) => imp.choice[i] === 'add').map((s) => s.item)];

/** ④ → 완료 */
export async function commit(imp, ctx) {
  imp.busy = true; imp.error = '';
  const items = toImport(imp);
  const id = `imp-${Date.now().toString(36)}`;
  try {
    await ctx.importTxs(items, id);
    localStorage.setItem(LAST_KEY, JSON.stringify({ id, at: Date.now(), count: items.length }));
    imp.result = { id, count: items.length };
    imp.bytes = null; imp.table = null; // 원본은 바로 버림
    imp.step = 5;
  } catch (e) {
    console.error(e);
    imp.error = '저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  imp.busy = false;
}

// ── 화면 ─────────────────────────────────────────────
const STEPS = ['파일', '열 맞추기', '중복 확인', '확정'];
const dot = (d) => `${Number(d.slice(5, 7))}.${d.slice(8)}`;
// 날짜 열의 엑셀 일련번호(46306)는 사람이 읽는 날짜로 보여 줌
const cell = (v, role) => esc(v instanceof Date ? v.toISOString().slice(0, 10) : role === 'date' && typeof v === 'number' && v > 20000 && v < 80000 ? excelSerialToYmd(v) : String(v ?? ''));

export function importView(m, imp) {
  const s = Math.min(imp.step, 4);
  const head = `<div class="flex items-center gap-2"><button class="icon-btn" data-imp-back aria-label="${imp.step > 1 && imp.step < 5 ? '이전 단계' : '설정으로'}">‹</button><h1 class="text-title">파일 가져오기</h1></div>
    <ol class="mt-3 grid grid-cols-4 gap-1.5" aria-label="가져오기 단계">${STEPS.map((l, i) => `<li ${i + 1 === s ? 'aria-current="step"' : ''} class="text-caption ${i + 1 === s ? 'text-ink font-bold' : 'text-ink-sub'}">
      <span class="block h-[5px] rounded-full mb-1.5 ${i < s ? 'bg-primary' : 'bg-line'}" aria-hidden="true"></span><span>${l}</span></li>`).join('')}</ol>`;
  const body = [step1, step2, step3, step4, step5][imp.step - 1](m, imp);
  return `<div class="max-w-[560px] mx-auto flex flex-col gap-3">${head}
    ${imp.error ? `<p class="glass px-4 py-3 text-body text-expense" role="alert">${esc(imp.error)}</p>` : ''}
    ${imp.busy ? `<div class="card-solid p-5" aria-busy="true"><p class="text-body text-ink-sub">표를 읽고 있어요…</p><div class="mt-3 flex flex-col gap-2">${'<div class="skeleton h-6 rounded-lg"></div>'.repeat(4)}</div></div>` : body}
  </div>${footer(m, imp)}`;
}

function footer(m, imp) {
  if (imp.busy || imp.step < 2 || imp.step > 4) return '';
  let label = '다음', disabled = false;
  if (imp.step === 2) disabled = missingRoles(imp.cols).length > 0;
  if (imp.step === 3) { const skip = imp.dup.suspect.filter((_, i) => imp.choice[i] !== 'add').length; label = skip ? `중복 ${skip}건 건너뛰고 계속` : '계속'; }
  if (imp.step === 4) { const n = toImport(imp).length; label = `${n}건 가져오기`; disabled = !n; }
  return `<div class="imp-foot"><button class="btn-primary w-full !min-h-[52px]" data-imp-next ${disabled ? 'disabled' : ''}>${label}</button></div>`;
}

function step1(m, imp) {
  const last = lastImport();
  return `<label class="drop" data-drop>
      <span class="text-4xl" aria-hidden="true">📥</span>
      <span class="text-body font-semibold text-center">카드사·은행에서 받은 파일을<br />여기에 끌어다 놓으세요</span>
      <span class="text-caption text-ink-sub">엑셀(.xls, .xlsx)과 CSV를 읽을 수 있어요</span>
      <span class="btn-ghost mt-1 pointer-events-none" aria-hidden="true">파일 고르기</span>
      <input type="file" class="sr-only" data-imp-file accept=".xls,.xlsx,.csv,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="가져올 파일 고르기" />
    </label>
    <button class="link-btn self-center" data-imp-sample>예시 파일로 해 보기</button>
    <p class="glass px-4 py-3 text-caption flex gap-2"><span aria-hidden="true">🔒</span><span>파일은 이 기기 밖으로 나가지 않아요.<br />원본은 저장하지 않고, 카드번호도 끝 4자리 말고는 남기지 않아요.</span></p>
    <section class="card-solid p-4" aria-labelledby="fmt-h"><h2 id="fmt-h" class="text-head">자동으로 알아보는 형식</h2>
      <div class="mt-3 flex flex-wrap gap-2">${PRESETS.map((p) => `<span class="chip ${p.verified ? 'chip-ok' : ''}">${p.emoji} ${esc(p.label)}</span>`).join('')}<span class="chip">📄 일반 형식</span></div>
      <p class="mt-3 text-caption text-ink-sub">다른 카드사 파일도 '일반 형식'으로 열을 맞춰 가져올 수 있어요. 현대·신한도 실제 파일로 확인하기 전까지는 추정 형식이에요.</p></section>
    ${last ? `<section class="card-solid p-4 flex items-center gap-3"><p class="flex-1 text-body">최근 가져온 ${last.count}건<span class="block text-caption text-ink-sub">가져온 지 24시간 안에는 한 번에 되돌릴 수 있어요.</span></p><button class="btn-ghost" data-imp-undo="${esc(last.id)}">되돌리기</button></section>` : ''}`;
}

function step2(m, imp) {
  const t = imp.table, rows = t.sheets[imp.sheet].rows, header = headerOf(imp);
  const preview = rows.slice(imp.headerRow + 1, imp.headerRow + 6);
  const miss = missingRoles(imp.cols);
  const split = imp.cols.includes('out') || imp.cols.includes('in');
  const { items, cancelled } = candidates(imp, m);
  const catMap = m.catMap;
  return `<div class="flex flex-wrap gap-2">
      <span class="chip ${imp.preset.id !== 'generic' ? 'chip-ok' : ''}">${imp.preset.id !== 'generic' ? `✓ ${esc(imp.preset.label)} 형식 같아요` : '📄 일반 형식'}</span>
      ${t.encoding ? `<button class="chip" data-imp-enc aria-label="글자 인코딩 ${t.encoding === 'euc-kr' ? 'EUC-KR' : 'UTF-8'}, 눌러서 바꾸기">인코딩 ${t.encoding === 'euc-kr' ? 'EUC-KR' : 'UTF-8'} ▾</button>` : ''}
      <span class="inline-flex items-center gap-1"><button class="chip !px-3 min-w-[44px] justify-center" data-imp-hdr="-1" aria-label="머리글 줄 위로" ${imp.headerRow === 0 ? 'disabled' : ''}>−</button><span class="text-caption font-semibold">머리글 ${imp.headerRow + 1}번째 줄</span><button class="chip !px-3 min-w-[44px] justify-center" data-imp-hdr="1" aria-label="머리글 줄 아래로">＋</button></span>
      ${t.sheets.length > 1 ? t.sheets.map((sh, i) => `<button class="chip" data-imp-sheet="${i}" aria-pressed="${i === imp.sheet}">${esc(sh.name)}</button>`).join('') : ''}
      ${imp.remembered ? '<span class="chip chip-ok">기억한 맞춤 적용</span>' : ''}
    </div>
    <section class="card-solid p-4" aria-labelledby="map-h">
      <div class="flex items-baseline justify-between"><h2 id="map-h" class="text-head">열 맞추기</h2><span class="text-caption text-ink-sub">원본 첫 5줄</span></div>
      <div class="mt-3 -mx-4 px-4 overflow-x-auto"><table class="map-table">
        <thead><tr>${header.map((h, i) => `<th scope="col" class="${imp.cols[i] !== 'ignore' ? 'on' : ''}">
          ${imp.auto[i] ? '<span class="text-micro font-bold text-primary">자동</span>' : '<span class="text-micro">&nbsp;</span>'}
          <select class="map-sel" data-imp-col="${i}" aria-label="'${esc(h || `${i + 1}번째 열`)}' 열의 용도">${ROLES.map((r) => `<option value="${r}" ${imp.cols[i] === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>
          <span class="block mt-1 text-caption text-ink-sub font-normal truncate">원본: ${esc(h || '(이름 없음)')}</span></th>`).join('')}</tr></thead>
        <tbody>${preview.map((r) => `<tr>${header.map((_, i) => `<td>${cell(r[i], imp.cols[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${miss.length ? `<p class="mt-3 text-caption text-expense font-semibold" role="alert">● ${miss.join(' ')}</p>` : '<p class="mt-3 text-caption text-ink-sub">보라색 칸은 자동으로 맞춘 것이에요. 눌러서 바꿀 수 있어요.</p>'}
    </section>
    <section class="card-solid p-4 flex flex-col gap-1" aria-label="가져오기 옵션">
      ${split ? '<p class="text-caption text-ink-sub min-h-[44px] flex items-center">입금·출금 열이 따로 있어요: 출금은 지출, 입금은 수입으로 넣어요.</p>'
        : `<label class="flex items-center justify-between gap-2 text-body min-h-[44px]">금액 부호<select class="select" data-imp-opt="sign">${[['expense', '양수 = 지출(카드)'], ['income', '양수 = 수입'], ['flip', '부호 뒤집기']].map(([v, l]) => `<option value="${v}" ${imp.opts.sign === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
      <label class="flex items-center justify-between gap-2 text-body min-h-[44px]">'취소'된 결제는 빼기<span class="switch"><input type="checkbox" data-imp-opt="excludeCancelled" ${imp.opts.excludeCancelled ? 'checked' : ''} /><span></span></span></label>
      <label class="flex items-center justify-between gap-2 text-body min-h-[44px]">결제수단<select class="select" data-imp-opt="accountId"><option value="">지정 안 함</option>${m.accounts.map((a) => `<option value="${esc(a.id)}" ${imp.opts.accountId === a.id ? 'selected' : ''}>${esc(a.emoji || '')} ${esc(a.name)}</option>`).join('')}</select></label>
      <label class="flex items-center justify-between gap-2 text-body min-h-[44px]">이 맞춤 기억하기<span class="switch"><input type="checkbox" data-imp-opt="remember" ${imp.opts.remember ? 'checked' : ''} /><span></span></span></label>
    </section>
    <section class="card-solid p-4" aria-labelledby="pv-h">
      <div class="flex items-baseline justify-between"><h2 id="pv-h" class="text-head">이렇게 들어가요</h2><span class="text-caption text-ink-sub">미리보기 · ${items.length}건${cancelled ? ` · 취소 ${cancelled}건 제외` : ''}</span></div>
      ${miss.length ? '<p class="mt-3 text-body text-ink-sub">열을 맞추면 미리보기가 나와요.</p>' : `<ul class="mt-2 flex flex-col">${items.slice(0, 5).map((x) => {
        const c = catMap.get(x.categoryId) ?? { emoji: '🧾', name: '기타' };
        return `<li class="flex items-center gap-3 min-h-[52px] border-b last:border-0" style="border-color:var(--line)">
          <span class="text-caption text-ink-sub tabular-nums w-11">${dot(x.date)}</span>
          <span class="tx-emoji !w-9 !h-9 ${x.by === 'fallback' ? 'opacity-60' : ''}" aria-hidden="true">${esc(c.emoji)}</span>
          <span class="flex-1 min-w-0"><span class="block text-body truncate">${esc(x.desc || c.name)}</span><span class="block text-caption text-ink-sub truncate">${esc(c.name)}${x.by === 'rule' ? ' · 내 규칙' : x.by === 'keyword' ? ' · 자동 추정' : ''}${x.card4 ? ` · 카드 끝 ${esc(x.card4)}` : ''}</span></span>
          <span class="text-body font-semibold tabular-nums ${x.kind === 'income' ? 'text-income' : 'text-expense'}">${signedWon(x.amount, x.kind)}</span></li>`;
      }).join('')}</ul>`}
    </section>`;
}

function step3(m, imp) {
  const d = imp.dup;
  const exist = (t) => `<span class="block text-caption text-ink-sub">이미 있는 기록</span><span class="block text-body truncate">${esc(t.memo || (m.catMap.get(t.categoryId)?.name ?? ''))}</span><span class="block text-caption tabular-nums">${dot(t.date)} · ${formatWon(t.amount)}</span>`;
  return `<div class="grid grid-cols-3 gap-2 text-center">
      <div class="card-solid p-3"><p class="text-title tabular-nums">${d.fresh.length}</p><p class="text-caption text-ink-sub">새 거래</p></div>
      <div class="card-solid p-3"><p class="text-title tabular-nums">${d.suspect.length}</p><p class="text-caption text-ink-sub"><span class="inline-block w-2 h-2 rounded-full bg-chart-3 mr-1 align-middle" aria-hidden="true"></span>중복 의심</p></div>
      <div class="card-solid p-3"><p class="text-title tabular-nums">${d.sure.length + d.cancelled}</p><p class="text-caption text-ink-sub">이미 있음·취소</p></div></div>
    ${d.sure.length ? `<p class="text-caption text-ink-sub px-1">이미 가져온 거래 ${d.sure.length}건은 자동으로 건너뛰어요.${d.invalid ? ` 날짜나 금액을 읽을 수 없는 줄 ${d.invalid}개도 뺐어요.` : ''}</p>` : d.invalid ? `<p class="text-caption text-ink-sub px-1">날짜나 금액을 읽을 수 없는 줄 ${d.invalid}개는 뺐어요.</p>` : ''}
    ${d.suspect.length ? `<div class="flex items-center justify-between"><h2 class="text-head">중복 의심 ${d.suspect.length}건</h2><button class="chip" data-imp-skipall>모두 건너뛰기</button></div>
    <ul class="flex flex-col gap-2">${d.suspect.map((s, i) => `<li class="card-solid p-3">
      <div class="grid grid-cols-2 gap-3"><div class="min-w-0">${s.reason === 'file' ? `<span class="block text-caption text-ink-sub">파일 안 같은 줄</span><span class="block text-body truncate">${esc(s.match.desc)}</span><span class="block text-caption tabular-nums">${dot(s.match.date)} · ${formatWon(s.match.amount)}</span>` : exist(s.match)}</div>
        <div class="min-w-0"><span class="block text-caption text-ink-sub">가져올 줄</span><span class="block text-body truncate">${esc(s.item.desc)}</span><span class="block text-caption tabular-nums">${dot(s.item.date)} · ${formatWon(s.item.amount)}</span></div></div>
      <div class="seg mt-2 w-full grid grid-cols-2" role="radiogroup" aria-label="${esc(s.item.desc)} ${formatWon(s.item.amount)} 처리">
        <button role="radio" aria-checked="${imp.choice[i] !== 'add'}" data-imp-choice="${i}" data-v="skip">건너뛰기</button>
        <button role="radio" aria-checked="${imp.choice[i] === 'add'}" data-imp-choice="${i}" data-v="add">그래도 추가</button></div></li>`).join('')}</ul>`
      : `<p class="glass px-4 py-3 text-body">✓ 기존 기록과 겹치는 거래가 없어요.</p>`}`;
}

function step4(m, imp) {
  const items = toImport(imp), s = summarize(items), d = imp.dup;
  const skipped = d.suspect.length - (items.length - d.fresh.length); // 건너뛴 의심 건
  const row = (k, v) => `<div class="flex justify-between gap-3 min-h-[40px] items-center border-b last:border-0" style="border-color:var(--line)"><dt class="text-body text-ink-sub">${k}</dt><dd class="text-body font-semibold tabular-nums text-right">${v}</dd></div>`;
  return `<section class="card-solid p-4" aria-labelledby="cf-h"><h2 id="cf-h" class="text-head">가져오기 전에 확인해요</h2>
      <dl class="mt-2">${row('파일', esc(imp.fileName))}${s.count ? row('기간', `${dot(s.from)} ~ ${dot(s.to)}`) : ''}${row('가져올 거래', `${s.count}건`)}
        ${row('지출 합계', `<span class="text-expense">−${formatWon(s.expense)}</span>`)}${row('수입·환급', `<span class="text-income">+${formatWon(s.income)}</span>`)}
        ${row('건너뛰는 거래', `중복 ${skipped + d.sure.length} · 취소 ${d.cancelled}`)}</dl></section>
    <p class="glass px-4 py-3 text-caption flex gap-2"><span aria-hidden="true">↩️</span><span>가져온 뒤 24시간 안에는 이번 묶음을 한 번에 되돌릴 수 있어요.</span></p>`;
}

function step5(m, imp) {
  return `<div class="card-solid p-6 text-center" role="status">
    <div class="done-check mx-auto" aria-hidden="true"><svg viewBox="0 0 56 56" width="56" height="56"><path d="M14 29l9 9 19-20"/></svg></div>
    <h2 class="mt-3 text-title tabular-nums">${imp.result.count}건을 가져왔어요!</h2>
    <p class="mt-2 text-body text-ink-sub">분류를 한 번 고치면<br />다음부터는 알아서 맞춰 드릴게요.</p>
    <div class="mt-5 flex gap-2 justify-center"><button class="btn-primary" data-nav="calendar" data-mode="list">목록에서 보기</button><button class="btn-ghost" data-imp-undo="${esc(imp.result.id)}">되돌리기</button></div></div>`;
}
