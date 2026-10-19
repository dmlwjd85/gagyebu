// CSV 읽기 (RFC 4180: 따옴표 안 쉼표·줄바꿈·"" 처리). 구분자는 쉼표·탭·세미콜론 자동 판별.
export function detectDelimiter(text) {
  const head = text.split(/\r?\n/).slice(0, 10).join('\n');
  const count = (c) => head.split(c).length;
  return [',', '\t', ';'].sort((a, b) => count(b) - count(a))[0];
}
export function parseCSV(text, delim = detectDelimiter(text)) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ''));
}
