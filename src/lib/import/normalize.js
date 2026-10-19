// 날짜·금액 정리: 카드사마다 다른 표기를 앱 형식(YYYY-MM-DD, 정수 원)으로.
import { isYmd } from '../dates.js';
const pad = (n) => String(n).padStart(2, '0');

/** 엑셀 날짜 일련번호(1900 체계) → YYYY-MM-DD */
export function excelSerialToYmd(n) {
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * 2026.10.03 / 2026-10-03 / 2026/10/3 / 20261003 / 26.10.03 / 2026년 10월 3일 / 시간 포함 / 엑셀 일련번호 / Date
 * @returns {string|null}
 */
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) return excelSerialToYmd(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) { const c = s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/); if (c) m = c; }
  if (!m) { const y2 = s.match(/^(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)/); if (y2) m = [y2[0], `20${y2[1]}`, y2[2], y2[3]]; }
  if (!m && /^\d{5}(\.\d+)?$/.test(s)) return parseDate(Number(s));
  if (!m) return null;
  const out = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return isYmd(out) ? out : null;
}

/**
 * "12,300원" / "₩12,300" / "-5,000" / "(5,000)" / "5,000-" / 12300 → 정수(부호 포함). 읽을 수 없으면 null
 */
export function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s,원₩\\]|KRW/g, '');
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { neg = !neg; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s));
  return neg ? -n : n;
}

/** 카드번호 → 끝 4자리 숫자만 (그 외는 버림). 없으면 null */
export function last4(v) {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}
