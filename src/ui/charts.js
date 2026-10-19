import { esc } from './util.js';
import { formatWon, shortWon } from '../lib/money.js';

// 카테고리 도넛 색 (시안 A 계열, 인접 조각 구분용 — 글자 아님)
export const PALETTE = ['#6D4AFF', '#E86FA5', '#FFB020', '#2BB8A3', '#5B7CFA', '#F2785C', '#9B7BFF', '#56C1E8', '#C2457E', '#8EA3C7'];

export function donut(items, { total, center = '총지출', size = 220, stroke = 30 } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  const segs = items.map((it, i) => {
    const len = Math.max(0, it.share * c - (items.length > 1 ? 2 : 0));
    const s = `<circle class="donut-seg" data-cat="${esc(it.categoryId)}" r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none"
      stroke="${it.color ?? PALETTE[i % PALETTE.length]}" stroke-width="${stroke}" stroke-dasharray="${len} ${c - len}"
      stroke-dashoffset="${-offset}" stroke-linecap="butt"><title>${esc(it.label)} ${formatWon(it.amount)}</title></circle>`;
    offset += it.share * c;
    return s;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" class="w-full max-w-[220px] mx-auto -rotate-90" role="img" aria-label="${esc(center)} ${formatWon(total)}, 카테고리 ${items.length}개">
      <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>${segs}
    </svg>
    <div class="absolute inset-0 grid place-items-center pointer-events-none text-center">
      <div><p class="text-caption text-ink-sub">${esc(center)}</p><p class="text-head tabular-nums">${formatWon(total)}</p></div></div>`;
}

// 월 추이 막대: 지출(보라)·수입(초록 테두리)·남긴 돈 표시
export function trendBars(rows, { currentYm } = {}) {
  const W = 320, H = 170, pad = 22, bw = 14;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.expense, r.income)));
  const step = (W - pad * 2) / rows.length;
  const y = (v) => H - 28 - (v / max) * (H - 50);
  const bars = rows.map((r, i) => {
    const x = pad + i * step + step / 2;
    const cur = r.ym === currentYm;
    return `<g>
      <rect x="${x - bw - 1}" y="${y(r.expense)}" width="${bw}" height="${H - 28 - y(r.expense)}" rx="4" fill="var(--primary)" opacity="${cur ? 1 : 0.55}"><title>${Number(r.ym.slice(5))}월 지출 ${formatWon(r.expense)}</title></rect>
      <rect x="${x + 1}" y="${y(r.income)}" width="${bw}" height="${H - 28 - y(r.income)}" rx="4" fill="var(--income)" opacity="${cur ? 0.9 : 0.45}"><title>${Number(r.ym.slice(5))}월 수입 ${formatWon(r.income)}</title></rect>
      <text x="${x}" y="${H - 10}" text-anchor="middle" class="fill-[var(--ink-sub)]" style="font-size:12px;font-weight:${cur ? 700 : 500}">${Number(r.ym.slice(5))}월</text>
      ${r.expense ? `<text x="${x - bw / 2 - 1}" y="${y(r.expense) - 4}" text-anchor="middle" class="fill-[var(--ink-sub)]" style="font-size:10px">${shortWon(r.expense)}</text>` : ''}
    </g>`;
  }).join('');
  const label = rows.map((r) => `${Number(r.ym.slice(5))}월 지출 ${formatWon(r.expense)} 수입 ${formatWon(r.income)}`).join(', ');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="월별 추이: ${esc(label)}">
    <line x1="${pad}" x2="${W - pad}" y1="${H - 28}" y2="${H - 28}" stroke="var(--line)"/>${bars}</svg>`;
}

export function ring(pct, { size = 132, stroke = 12, color = 'var(--primary)' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.min(1, Math.max(0, pct));
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="-rotate-90" aria-hidden="true">
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle class="ring-fill" r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${p * c} ${c}"/></svg>`;
}
