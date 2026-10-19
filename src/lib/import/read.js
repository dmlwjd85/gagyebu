// 파일 → 표(문자열 2차원 배열). 브라우저 안에서만 처리하고 원본은 어디에도 저장하지 않는다.
import { decodeBytes } from './decode.js';
import { parseCSV } from './csvparse.js';

const isCSV = (name, bytes) => /\.(csv|txt|tsv)$/i.test(name) || (!/\.xlsx?$/i.test(name) && !isZip(bytes) && !isOle(bytes) && !looksHtml(bytes));
const isZip = (b) => b[0] === 0x50 && b[1] === 0x4b; // xlsx
const isOle = (b) => b[0] === 0xd0 && b[1] === 0xcf; // 옛 xls
const looksHtml = (b) => /<(html|table|meta|!doctype)/i.test(new TextDecoder('latin1').decode(b.subarray(0, 2048)));

const cellText = (v) => (v == null ? '' : v instanceof Date ? v : typeof v === 'number' ? v : String(v).trim());

/**
 * @param {Uint8Array} bytes
 * @param {string} name 파일 이름(확장자 판별용)
 * @param {{encoding?: 'auto'|'utf-8'|'euc-kr', XLSX?: object}} opt XLSX는 SheetJS 모듈(테스트에서 주입 가능)
 * @returns {Promise<{ kind: 'csv'|'excel'|'html', encoding: string|null, sheets: {name: string, rows: any[][]}[] }>}
 */
export async function readTable(bytes, name, opt = {}) {
  const enc = opt.encoding ?? 'auto';
  if (isCSV(name, bytes)) {
    const { text, encoding } = decodeBytes(bytes, enc);
    return { kind: 'csv', encoding, sheets: [{ name: 'CSV', rows: parseCSV(text) }] };
  }
  const XLSX = opt.XLSX ?? (await import('xlsx'));
  const html = !isZip(bytes) && !isOle(bytes) && looksHtml(bytes);
  let wb;
  if (html) {
    // 현대카드 등 '.xls'인데 실제로는 HTML 표인 파일: 글자 인코딩을 먼저 맞춘 뒤 HTML로 읽음
    const { text, encoding } = decodeBytes(bytes, enc);
    wb = XLSX.read(text, { type: 'string', raw: true }); // raw: '2026.10.03'·'5,600' 같은 글자를 그대로 둠
    return { kind: 'html', encoding, sheets: sheetsOf(XLSX, wb) };
  }
  wb = XLSX.read(bytes, { type: 'array' }); // 날짜 칸은 엑셀 일련번호(숫자) → parseDate가 바꿈
  return { kind: 'excel', encoding: null, sheets: sheetsOf(XLSX, wb) };
}

function sheetsOf(XLSX, wb) {
  return wb.SheetNames.map((n) => ({
    name: n,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false })
      .map((r) => r.map(cellText))
      .filter((r) => r.some((v) => v !== '')),
  })).filter((s) => s.rows.length);
}
