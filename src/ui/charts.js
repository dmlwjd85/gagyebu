import { esc } from './util.js';
import { formatWon, shortWon, spendText } from '../lib/money.js';

// 카테고리 도넛 색 (시안 A 계열, 인접 조각 구분용 — 글자 아님)
// 차트 색 7개 (스펙 14절, 그래픽 대비 3:1 이상). 7번은 '그 밖의'
export const PALETTE = [1, 2, 3, 4, 5, 6].map((i) => `var(--chart-${i})`);
export const REST_COLOR = 'var(--chart-7)';

/**
 * 도넛 조각 길이·시작점: share는 0~1로 자르고 누적이 한 바퀴(c)를 넘지 않게 → 조각이 겹치지 않음
 * (환불로 음수·100% 넘는 비율이 들어와도 안전)
 */
export function donutSegments(items, c) {
  const gap = items.length > 1 ? 2 : 0;
  let offset = 0;
  return items.map((it) => {
    const share = Math.min(1, Math.max(0, Number(it.share) || 0));
    const span = Math.min(share * c, c - offset);
    const seg = { len: Math.max(0, span - gap), offset };
    offset += Math.max(0, span);
    return seg;
  });
}
export function donut(items, { total, center = '총지출', size = 220, stroke = 30 } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const geo = donutSegments(items, c);
  const segs = items.map((it, i) => {
    const { len, offset } = geo[i];
    const s = `<circle class="donut-seg" data-cat="${esc(it.categoryId)}" r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none"
      stroke="${it.color ?? PALETTE[i % PALETTE.length]}" stroke-width="${stroke}" stroke-dasharray="${len} ${c - len}"
      stroke-dashoffset="${-offset}" stroke-linecap="butt" style="animation-delay:${i * 40}ms"><title>${esc(it.label)} ${formatWon(it.amount)}</title></circle>`;
    return s;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" class="donut w-full max-w-[220px] mx-auto -rotate-90" role="img" aria-label="${esc(center)} ${formatWon(total)}, 카테고리 ${items.length}개">
      <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>${segs}
    </svg>
    <div class="absolute inset-0 grid place-items-center pointer-events-none text-center">
      <div><p class="text-caption text-ink-sub">${esc(center)}</p><p class="text-head tabular-nums">${formatWon(total)}</p></div></div>`;
}

// 월 추이 막대: 지출(c1)과 남긴 돈(수입색), 왼쪽 눈금·점선 격자, 막대(월)를 누르면 아래에 상세
const niceStep = (max) => { const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw || 1)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= raw); };
export function trendBars(rows, { currentYm, selectedYm } = {}) {
  const W = 340, H = 190, L = 38, R = 2, T = 10, B = 26, bw = 13;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.expense, r.saved)));
  const step = niceStep(max), top = step * Math.ceil(max / step);
  const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / top);
  const col = (W - L - R) / rows.length;
  let grid = '';
  for (let v = 0; v <= top + 1; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" ${v ? 'stroke-dasharray="3 3"' : ''}/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end" fill="currentColor" class="text-ink-sub tabular-nums" style="font-size:10px">${v ? shortWon(v) : 0}</text>`;
  const bars = rows.map((r, i) => {
    const x = L + i * col + col / 2, cur = r.ym === currentYm, sel = r.ym === selectedYm;
    return `<g class="bar-g" data-bar="${r.ym}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="${Number(r.ym.slice(5))}월 지출 ${spendText(r.expense)}, 남긴 돈 ${formatWon(r.saved)}">
      <rect x="${x - col / 2}" y="${T}" width="${col}" height="${H - T - 2}" rx="8" fill="${sel ? 'var(--heat-1)' : 'transparent'}" ${cur ? 'stroke="var(--primary)" stroke-width="1.5"' : ''}/>
      <rect class="bar" style="animation-delay:${i * 40}ms" x="${x - bw - 1}" y="${y(r.expense)}" width="${bw}" height="${y(0) - y(r.expense)}" rx="4" fill="var(--chart-1)"/>
      <rect class="bar" style="animation-delay:${i * 40 + 20}ms" x="${x + 1}" y="${y(r.saved)}" width="${bw}" height="${y(0) - y(r.saved)}" rx="4" fill="var(--income)"/>
      <text x="${x}" y="${H - 8}" text-anchor="middle" fill="currentColor" class="text-ink-sub" style="font-size:12px;font-weight:${cur ? 700 : 500}">${Number(r.ym.slice(5))}월</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full trend" role="group" aria-label="월별 지출과 남긴 돈">${grid}${bars}</svg>`;
}

export function ring(pct, { size = 132, stroke = 12, color = 'var(--primary)' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.min(1, Math.max(0, pct));
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="-rotate-90" aria-hidden="true">
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    ${p > 0 ? `<circle class="ring-fill" r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${p * c} ${c}"/>` : ''}</svg>`; // 0%는 둥근 끝 점도 안 그림
}
