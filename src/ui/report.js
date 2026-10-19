// 월간 리포트 공유 이미지 카드(1080×1350, 인스타 세로 비율). 기기 안에서 그리고, 공유·저장만 함.
import { esc } from './util.js';
import { formatWon, spendParts, spendText, rateNote } from '../lib/money.js';
import { byCategory } from '../lib/stats.js';

const W = 1080, H = 1350;
const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
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

/** 캔버스에 그리기 → PNG Blob */
export async function drawReport(d, { dark = false } = {}) {
  try { await Promise.all(['800', '700', '500'].map((w) => document.fonts.load(`${w} 40px "Pretendard Variable"`, '쓱가계부월리포트0123456789원'))); } catch {}
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const ink = dark ? '#F2EEFF' : '#1E1B3A', sub = dark ? '#B8B3D6' : '#5B5675', card = dark ? '#1C1A2E' : '#FFFFFF';
  // 배경: 오로라 파스텔
  ctx.fillStyle = dark ? '#0F0E1A' : '#F6F4FF'; ctx.fillRect(0, 0, W, H);
  // 'transparent'는 검은 투명으로 섞여 회색 띠가 생기므로 같은 색의 알파 0으로 끝냄
  const glow = (x, y, r, rgb, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  glow(120, 60, 620, dark ? '112,72,242' : '176,156,255', dark ? 0.35 : 0.55);
  glow(1000, 200, 560, dark ? '194,69,126' : '255,170,205', dark ? 0.28 : 0.5);
  glow(540, 1350, 700, dark ? '63,209,190' : '160,230,220', dark ? 0.15 : 0.45);
  // 머리: 쓱 가계부 · N월 리포트
  ctx.fillStyle = ink; ctx.font = `800 44px ${FONT}`; ctx.textBaseline = 'alphabetic';
  ctx.fillText('쓱 가계부', 80, 130);
  ctx.fillStyle = sub; ctx.font = `600 36px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(`${d.ym.slice(0, 4)}년 ${d.month}월 리포트`, W - 80, 130); ctx.textAlign = 'left';
  // 큰 카드: 그라데이션 + 남긴 돈
  const g = ctx.createLinearGradient(80, 190, W - 80, 640); g.addColorStop(0, '#7048F2'); g.addColorStop(.55, '#C2457E'); g.addColorStop(1, '#B85A3E');
  roundRect(ctx, 80, 190, W - 160, 450, 56); ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `600 40px ${FONT}`; ctx.fillText(`${d.month}월에 남긴 돈`, 140, 290);
  // 큰 금액(수십억)도 카드 밖으로 넘치지 않게 글자 크기를 폭에 맞춤(QA L1)
  ctx.fillText(fit(ctx, formatWon(d.saved), 800, 120, W - 280), 140, 430);
  ctx.font = `600 36px ${FONT}`;
  // 100% 넘는 저축률은 환불 때문이라고 짧게 붙임(자세한 설명은 미리보기 아래 문구)
  const rateText = d.rate != null ? `저축률 ${d.rate < 0 ? '−' : ''}${Math.abs(d.rate)}%${d.rate > 100 ? ' · 환불 덕분' : ''}` : '수입 기록 없음';
  ctx.fillText(rateText, 140, 520);
  if (d.diff != null) {
    const dt = `지출 지난달보다 ${d.diff > 0 ? `${d.diff}% ↑` : d.diff < 0 ? `${-d.diff}% ↓` : '같음'}`;
    const dtFit = fit(ctx, dt, 600, 36, W - 280 - ctx.measureText(rateText).width - 40);
    ctx.textAlign = 'right'; ctx.fillText(dtFit, W - 140, 520); ctx.textAlign = 'left';
  }
  const sum = fit(ctx, `수입 ${formatWon(d.income)} · 지출 ${spendText(d.expense)}`, 500, 32, W - 280); ctx.fillText(sum, 140, 590);
  // 많이 쓴 곳 TOP 3
  roundRect(ctx, 80, 680, W - 160, 400, 48); ctx.fillStyle = card; ctx.fill();
  ctx.fillStyle = ink; ctx.font = `700 40px ${FONT}`; ctx.fillText('많이 쓴 곳 TOP 3', 140, 760);
  const max = d.top[0]?.amount || 1;
  d.top.forEach((t, i) => {
    const y = 840 + i * 80;
    ctx.font = `48px ${FONT}`; ctx.fillText(t.emoji, 140, y + 14);
    // 긴 카테고리 이름(공백 없는 20자)이 금액과 겹치지 않게 이름 칸 폭을 정함
    ctx.fillStyle = ink; ctx.textAlign = 'right'; const amt = fit(ctx, formatWon(t.amount), 700, 36, 360); const aw = ctx.measureText(amt).width; ctx.fillText(amt, W - 140, y + 8); ctx.textAlign = 'left';
    ctx.fillText(fit(ctx, t.name, 600, 36, W - 140 - aw - 40 - 210), 210, y + 8);
    roundRect(ctx, 210, y + 24, (W - 350) * (t.amount / max), 12, 6); ctx.fillStyle = ['#6D4AFF', '#D63F73', '#C4621A'][i]; ctx.fill(); ctx.fillStyle = ink;
  });
  if (!d.top.length) { ctx.fillStyle = sub; ctx.font = `500 34px ${FONT}`; ctx.fillText(d.refund ? `이 달에는 환불만 있었어요(+${formatWon(d.refund)}).` : '이 달에는 지출 기록이 없어요.', 140, 860); }
  // 스티커: 무지출·연속 기록·기록 수
  // 연속 0일은 스티커에서 뺌(공유 이미지에 '0일 연속'은 어색함)
  const chips = [`🌱 무지출 ${d.noSpend}일`, ...(d.streak > 0 ? [`🔥 ${d.streak}일 연속 기록`] : []), `🧾 기록 ${d.count}건`];
  ctx.font = `700 34px ${FONT}`;
  let x = 80;
  for (const t of chips) {
    const w = ctx.measureText(t).width + 64;
    roundRect(ctx, x, 1120, w, 84, 42); ctx.fillStyle = card; ctx.fill();
    ctx.fillStyle = ink; ctx.fillText(t, x + 32, 1174); x += w + 20;
  }
  ctx.fillStyle = sub; ctx.font = `500 28px ${FONT}`;
  ctx.fillText('10초 기록, 하루 한 번 보는 내 돈 날씨 · 광고 없는 가계부', 80, 1290);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

/** 미리보기 대화상자 + 공유/저장 */
export async function openReport(m, { toast }) {
  const d = reportData(m);
  const blob = await drawReport(d, { dark: m.dark });
  const url = URL.createObjectURL(blob);
  const name = `쓱가계부_${d.ym}_리포트.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const canShare = navigator.canShare?.({ files: [file] });
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4 fade-in overflow-y-auto';
  wrap.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="rp-t" class="w-full max-w-sm rounded-lg bg-surface-solid p-4 shadow-glass my-auto">
    <h2 id="rp-t" class="text-head">${d.month}월 리포트 카드</h2>
    <img src="${url}" alt="${esc(`${d.month}월 리포트: 남긴 돈 ${formatWon(d.saved)}, 수입 ${formatWon(d.income)}, 지출 ${spendText(d.expense)}${d.top.length ? `, 많이 쓴 곳 ${d.top.map((t) => t.name).join(', ')}` : ''}`)}" class="mt-3 w-full rounded-2xl" width="1080" height="1350" />
    ${d.note ? `<p class="mt-2 text-caption">💡 ${esc(d.note)}</p>` : ''}
    <p class="mt-2 text-caption text-ink-sub">이 기기에서 만든 이미지예요. 공유하기 전에 숫자를 한 번 확인해 주세요.</p>
    <div class="mt-3 flex gap-2 justify-end"><button class="btn-ghost" data-rp="close">닫기</button>
      ${canShare ? '<button class="btn-ghost" data-rp="save">저장</button><button class="btn-primary" data-rp="share">공유하기</button>' : '<button class="btn-primary" data-rp="save">이미지 저장</button>'}</div></div>`;
  const app = document.getElementById('app'), back = document.activeElement;
  const done = () => { wrap.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', onKey); if (app) app.inert = false; back?.focus?.(); };
  if (app) app.inert = true;
  const onKey = (e) => e.key === 'Escape' && done();
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rp]');
    if (e.target === wrap || b?.dataset.rp === 'close') return done();
    if (b?.dataset.rp === 'save') { const a = Object.assign(document.createElement('a'), { href: url, download: name }); document.body.append(a); a.click(); a.remove(); toast('이미지를 저장했어요.'); }
    if (b?.dataset.rp === 'share') { try { await navigator.share({ files: [file], title: `${d.month}월 리포트` }); } catch (err) { if (err?.name !== 'AbortError') toast('공유하지 못했어요. 이미지 저장을 써 보세요.'); } }
  });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  wrap.querySelector('[data-rp="share"],[data-rp="save"]').focus();
  return d;
}
