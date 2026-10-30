// 월간 리포트 공유 이미지 카드(1080×1350, 인스타 세로 비율). 기기 안에서 그리고, 공유·저장만 함.
import { esc } from './util.js';
import { formatWon, spendParts, spendText, rateNote } from '../lib/money.js';
import { byCategory } from '../lib/stats.js';

const W = 1080, H = 1350;
// 글자는 쨈 본문(400·700), 머리의 '쨈 가계부'(44px)만 쨈 제목 평면(28px 이상 제목용, 굵기 400 하나). 글꼴이 없으면 Pretendard·시스템 글꼴.
const FONT = '"JJAEM Body", "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const TITLE_FONT = `"JJAEM Title Flat", ${FONT}`;
// 글자가 maxW보다 넓으면 글자 크기를 줄임(최소 40%). 그래도 넓으면 뒤를 '…'로 줄인 글자를 돌려줌
function fit(ctx, text, weight, size, maxW) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = `${weight} ${Math.max(Math.floor(size * 0.4), Math.floor((size * maxW) / w))}px ${FONT}`;
  const t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  const ch = [...t]; // 이모지가 반으로 잘리지 않게 글자 단위
  while (ch.length > 1 && ctx.measureText(ch.join('') + '…').width > maxW) ch.pop();
  return ch.join('') + '…';
}

/** 리포트에 넣을 숫자 모으기(화면 미리보기와 이미지가 같은 값을 씀) */
export function reportData(m) {
  const top = byCategory(m.periodTxs).filter((c) => c.amount > 0).slice(0, 3)
    .map(({ categoryId, amount }) => ({ ...(m.catMap.get(categoryId) ?? { emoji: '🧾', name: '기타' }), amount }));
  const prev = m.trend[m.trend.length - 2];
  // 지출 비교는 '쓴 돈'(0원 밑으로 안 내려감)끼리. 지난달 쓴 돈이 0원이면 비교 안 함
  const cur = spendParts(m.tot.expense).spent, before = prev ? spendParts(prev.expense).spent : 0;
  const diff = before ? Math.round(((cur - before) / before) * 100) : null;
  const rate = m.tot.income ? Math.round((m.tot.saved / m.tot.income) * 100) : null;
  const { spent, refund } = spendParts(m.tot.expense);
  return { ym: m.viewYm, month: Number(m.viewYm.slice(5)), ...m.tot, spent, refund, top, diff, rate, note: rateNote(m.tot), noSpend: m.noSpend, streak: m.streak, count: m.periodTxs.length };
}

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

/** 이미지에 그릴 글자를 한곳에서 만든다. 그리기 전에 이 글자 전부로 글꼴을 받아 두려고(QA N1: 첫 조각 밖 글자가 대체 글꼴로 구워지던 것) */
export function reportStrings(d) {
  const diff = d.diff == null ? null : `지출 지난달보다 ${d.diff > 0 ? `${d.diff}% ↑` : d.diff < 0 ? `${-d.diff}% ↓` : '같음'}`;
  return {
    title: '쨈 가계부',
    head: `${d.ym.slice(0, 4)}년 ${d.month}월 리포트`,
    savedLabel: `${d.month}월에 남긴 돈`,
    saved: formatWon(d.saved),
    // 100% 넘는 저축률은 환불 때문이라고 짧게 붙임(자세한 설명은 미리보기 아래 문구)
    rate: d.rate != null ? `저축률 ${d.rate < 0 ? '−' : ''}${Math.abs(d.rate)}%${d.rate > 100 ? ' · 환불 덕분' : ''}` : '수입 기록 없음',
    diff,
    sum: `수입 ${formatWon(d.income)} · 지출 ${spendText(d.expense)}`,
    topTitle: '많이 쓴 곳 TOP 3',
    top: d.top.map((t) => ({ emoji: t.emoji, name: String(t.name), amount: formatWon(t.amount) })),
    empty: d.top.length ? null : d.refund ? `이 달에는 환불만 있었어요(+${formatWon(d.refund)}).` : '이 달에는 지출 기록이 없어요.',
    // 연속 0일은 스티커에서 뺌(공유 이미지에 '0일 연속'은 어색함)
    chips: [`🌱 무지출 ${d.noSpend}일`, ...(d.streak > 0 ? [`🔥 ${d.streak}일 연속 기록`] : []), `🧾 기록 ${d.count}건`],
    foot: '10초 기록, 하루 한 번 보는 내 돈 날씨 · 광고 없는 가계부',
  };
}

/** 본문 글꼴로 그릴 글자 전부(줄임표 포함). 제목 글꼴은 '쨈 가계부'만 */
export function reportBodyText(t) {
  return [t.head, t.savedLabel, t.saved, t.rate, t.diff, t.sum, t.topTitle, ...t.top.flatMap((x) => [x.name, x.amount]), t.empty, ...t.chips, t.foot, '…'].filter(Boolean).join('\n');
}

/** 그리기 전에 쓰는 굵기(400·700 두 파일)마다 실제로 그릴 글자 전부로 글꼴을 받아 둔다.
 *  한 조각이 실패해도 나머지는 끝까지 기다리고(allSettled, QA 3차 M2), 글꼴이 응답하지 않으면 3초 뒤 있는 글꼴로 그린다(M1).
 *  돌려주는 값: 다 받았으면 true, 3초가 지났거나 취소(signal)됐으면 false. */
export const REPORT_FONT_WAIT = 3000;
const REPORT_FACES = (t) => [['400 40px "JJAEM Body"', reportBodyText(t)], ['700 40px "JJAEM Body"', reportBodyText(t)], ['400 44px "JJAEM Title Flat"', t.title]];
export function settleReportFonts(t, fonts = globalThis.document?.fonts) {
  if (!fonts?.load) return Promise.resolve(true);
  return Promise.allSettled(REPORT_FACES(t).map(([f, x]) => fonts.load(f, x))).then(() => true);
}
/** 지금 바로 그려도 되는지(그릴 글자의 글꼴이 다 와 있는지). check 가 없으면 알 수 없으니 false */
export function reportFontsReady(t, fonts = globalThis.document?.fonts) {
  if (!fonts?.check) return false;
  try { return REPORT_FACES(t).every(([f, x]) => fonts.check(f, x)); } catch { return false; }
}
export function loadReportFonts(t, fonts = globalThis.document?.fonts, wait = REPORT_FONT_WAIT, signal) {
  if (!fonts?.load) return Promise.resolve(true);
  let timer, onAbort;
  const stop = new Promise((r) => {
    timer = setTimeout(() => r(false), wait);
    if (signal) { onAbort = () => r(false); if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  });
  return Promise.race([settleReportFonts(t, fonts), stop]).finally(() => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); });
}

/** 그림 한 장 만들기(QA 4차 P1).
 *  3초 안에 글꼴이 다 오면 그 그림 그대로. 못 오면 있는 글꼴로 먼저 그리고(img.fresh=false), 글꼴이 다 오면 다시 그려 img.late 로 알림.
 *  저장·공유 직전에는 img.current() 로 받는다: 글꼴이 이미 다 왔으면 다시 그린 그림, 아직이면 지금 그림.
 *  signal 이 취소되면(화면을 떠남, P2) null. */
export async function makeReport(d, { dark = false, fonts = globalThis.document?.fonts, wait = REPORT_FONT_WAIT, signal, late = true } = {}) {
  const t = reportStrings(d);
  const inTime = await loadReportFonts(t, fonts, wait, signal);
  if (signal?.aborted) return null;
  const img = { blob: await paintReport(d, t, dark), fresh: inTime, late: null, stopped: false };
  if (signal?.aborted) return null;
  img.stop = () => { img.stopped = true; };
  if (!inTime && late) {
    img.late = settleReportFonts(t, fonts).then(async () => {
      if (img.stopped || signal?.aborted) return null;
      img.blob = await paintReport(d, t, dark); img.fresh = true;
      return img.blob;
    });
  }
  img.current = async () => { if (!img.fresh && img.late && reportFontsReady(t, fonts)) await img.late; return img.blob; };
  return img;
}

/** 글꼴을 (3초까지) 기다린 뒤 캔버스에 그리기 → PNG Blob. 요약 공유처럼 한 번 그리고 끝나는 곳에서 씀 */
export async function drawReport(d, { dark = false } = {}) {
  return (await makeReport(d, { dark, late: false })).blob;
}

/** 캔버스에 그리기(기다리지 않음) → PNG Blob */
function paintReport(d, t, dark) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const ink = dark ? '#F2EEFF' : '#1E1B3A', sub = dark ? '#B8B3D6' : '#5B5675', card = dark ? '#1C1A2E' : '#FFFFFF';
  // 배경: 오로라 파스텔
  ctx.fillStyle = dark ? '#0F0E1A' : '#F6F4FF'; ctx.fillRect(0, 0, W, H);
  // 'transparent'는 검은 투명으로 섞여 회색 띠가 생기므로 같은 색의 알파 0으로 끝냄
  const glow = (x, y, r, rgb, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  glow(120, 60, 620, dark ? '109,74,255' : '176,156,255', dark ? 0.35 : 0.55);
  glow(1000, 200, 560, dark ? '47,111,214' : '160,195,255', dark ? 0.28 : 0.5);
  glow(540, 1350, 700, dark ? '63,209,190' : '160,230,220', dark ? 0.15 : 0.45);
  // 머리: 쨈 가계부 · N월 리포트
  ctx.fillStyle = ink; ctx.font = `400 44px ${TITLE_FONT}`; ctx.textBaseline = 'alphabetic';
  ctx.fillText(t.title, 80, 130);
  ctx.fillStyle = sub; ctx.font = `400 36px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(t.head, W - 80, 130); ctx.textAlign = 'left';
  // 큰 카드: 아이콘과 같은 색 계열(보라 #6D4AFF → 파랑 #2F6FD6 → 청록 #16897C) + 남긴 돈
  const g = ctx.createLinearGradient(80, 190, W - 80, 640); g.addColorStop(0, '#6D4AFF'); g.addColorStop(.55, '#2F6FD6'); g.addColorStop(1, '#16897C');
  roundRect(ctx, 80, 190, W - 160, 450, 56); ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 40px ${FONT}`; ctx.fillText(t.savedLabel, 140, 290);
  // 큰 금액(수십억)도 카드 밖으로 넘치지 않게 글자 크기를 폭에 맞춤(QA L1)
  ctx.fillText(fit(ctx, t.saved, 800, 120, W - 280), 140, 430);
  ctx.font = `400 36px ${FONT}`;
  const rateText = t.rate;
  ctx.fillText(rateText, 140, 520);
  if (t.diff != null) {
    const dtFit = fit(ctx, t.diff, 400, 36, W - 280 - ctx.measureText(rateText).width - 40);
    ctx.textAlign = 'right'; ctx.fillText(dtFit, W - 140, 520); ctx.textAlign = 'left';
  }
  const sum = fit(ctx, t.sum, 500, 32, W - 280); ctx.fillText(sum, 140, 590);
  // 많이 쓴 곳 TOP 3
  roundRect(ctx, 80, 680, W - 160, 400, 48); ctx.fillStyle = card; ctx.fill();
  ctx.fillStyle = ink; ctx.font = `700 40px ${FONT}`; ctx.fillText(t.topTitle, 140, 760);
  const max = d.top[0]?.amount || 1;
  t.top.forEach((x, i) => {
    const amount = d.top[i].amount;
    const y = 840 + i * 80;
    ctx.font = `48px ${FONT}`; ctx.fillText(x.emoji, 140, y + 14);
    // 긴 카테고리 이름(공백 없는 20자)이 금액과 겹치지 않게 이름 칸 폭을 정함
    ctx.fillStyle = ink; ctx.textAlign = 'right'; const amt = fit(ctx, x.amount, 700, 36, 360); const aw = ctx.measureText(amt).width; ctx.fillText(amt, W - 140, y + 8); ctx.textAlign = 'left';
    ctx.fillText(fit(ctx, x.name, 400, 36, W - 140 - aw - 40 - 210), 210, y + 8);
    // 1위 보라는 테마별 명도: 흰 카드 #4F2FD6 7.75:1(L* 35), 다크 카드 #B3A3FF 7.76:1(L* 72) → 2위 파랑(L* 48)과 밝기로도 갈림(QA R1)
    roundRect(ctx, 210, y + 24, (W - 350) * (amount / max), 12, 6); ctx.fillStyle = (dark ? ['#B3A3FF', '#2F6FD6', '#16897C'] : ['#4F2FD6', '#2F6FD6', '#16897C'])[i]; ctx.fill(); ctx.fillStyle = ink;
  });
  if (t.empty) { ctx.fillStyle = sub; ctx.font = `500 34px ${FONT}`; ctx.fillText(t.empty, 140, 860); }
  // 스티커: 무지출·연속 기록·기록 수
  const chips = t.chips;
  ctx.font = `700 34px ${FONT}`;
  let x = 80;
  for (const chip of chips) {
    const w = ctx.measureText(chip).width + 64;
    roundRect(ctx, x, 1120, w, 84, 42); ctx.fillStyle = card; ctx.fill();
    ctx.fillStyle = ink; ctx.fillText(chip, x + 32, 1174); x += w + 20;
  }
  ctx.fillStyle = sub; ctx.font = `500 28px ${FONT}`;
  ctx.fillText(t.foot, 80, 1290);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

/** 미리보기 대화상자 + 공유/저장. signal 이 취소되면(만드는 동안 화면을 떠남, QA 4차 P2) 창을 열지 않고 null */
export async function openReport(m, { toast, signal } = {}) {
  const d = reportData(m);
  const img = await makeReport(d, { dark: m.dark, signal });
  if (!img || signal?.aborted) { img?.stop?.(); return null; }
  let blob = img.blob, url = URL.createObjectURL(blob);
  const name = `쨈가계부_${d.ym}_리포트.png`;
  let file = new File([blob], name, { type: 'image/png' });
  const canShare = navigator.canShare?.({ files: [file] });
  const wrap = document.createElement('div');
  // 늦게 온 글꼴로 다시 그린 그림으로 바꿔 끼움(미리보기·저장·공유 모두 새 그림)
  const swap = (next) => {
    if (!next || next === blob || !wrap.isConnected) return;
    URL.revokeObjectURL(url); blob = next; url = URL.createObjectURL(blob); file = new File([blob], name, { type: 'image/png' });
    const pic = wrap.querySelector('img'); if (pic) pic.src = url;
  };
  wrap.className = 'fixed inset-0 z-[70] dlg-wrap p-4 fade-in';
  wrap.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="rp-t" class="dlg-card">
    <h2 id="rp-t">${d.month}월 리포트 카드</h2>
    <img src="${url}" alt="${esc(`${d.month}월 리포트: 남긴 돈 ${formatWon(d.saved)}, 수입 ${formatWon(d.income)}, 지출 ${spendText(d.expense)}${d.top.length ? `, 많이 쓴 곳 ${d.top.map((t) => t.name).join(', ')}` : ''}`)}" class="mt-3 w-full rounded-2xl" width="1080" height="1350" />
    ${d.note ? `<p class="mt-2 text-caption">💡 ${esc(d.note)}</p>` : ''}
    <p class="mt-2 text-caption text-ink-sub">이 기기에서 만든 이미지예요. 공유하기 전에 숫자를 한 번 확인해 주세요.</p>
    <div class="dlg-actions"><button class="btn-ghost" data-rp="close">닫기</button>
      ${canShare ? '<button class="btn-ghost" data-rp="save">저장</button><button class="btn-primary" data-rp="share">공유하기</button>' : '<button class="btn-primary" data-rp="save">이미지 저장</button>'}</div></div>`;
  const app = document.getElementById('app'), back = document.activeElement;
  // 만드는 동안 버튼이 disabled 라 포커스가 빠졌을 수 있음 → 닫으면 리포트 버튼으로 돌려줌
  const done = () => { img.stop(); wrap.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', onKey); if (app) app.inert = false; (back?.isConnected && back !== document.body ? back : document.querySelector('[data-action="report"]'))?.focus?.(); };
  if (app) app.inert = true;
  const onKey = (e) => e.key === 'Escape' && done();
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rp]');
    if (e.target === wrap || b?.dataset.rp === 'close') return done();
    if (b?.dataset.rp === 'save' || b?.dataset.rp === 'share') swap(await img.current()); // 저장·공유 직전: 글꼴이 다 왔으면 다시 그린 그림으로
    if (b?.dataset.rp === 'save') { const a = Object.assign(document.createElement('a'), { href: url, download: name }); document.body.append(a); a.click(); a.remove(); toast('이미지를 저장했어요.'); }
    if (b?.dataset.rp === 'share') { try { await navigator.share({ files: [file], title: `${d.month}월 리포트` }); } catch (err) { if (err?.name !== 'AbortError') toast('공유하지 못했어요. 이미지 저장을 써 보세요.'); } }
  });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  img.late?.then(swap);
  wrap.querySelector('[data-rp="share"],[data-rp="save"]').focus();
  return d;
}
