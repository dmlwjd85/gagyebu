// 학생: 월간 요약을 글과 이미지로 공유. 공유가 없으면 글은 복사, 이미지는 다운로드.
import { formatWon, spendText } from './money.js';

export function monthSummaryText(d) {
  const lines = [
    `쓱 가계부 ${String(d.ym).slice(0, 4)}년 ${d.month}월`,
    `남긴 돈 ${formatWon(d.saved)}`,
    `수입 ${formatWon(d.income)} · 지출 ${spendText(d.expense)}`,
  ];
  if (d.top?.length) {
    lines.push(`많이 쓴 곳 ${d.top.map((t) => `${t.emoji ? `${t.emoji} ` : ''}${t.name} ${formatWon(t.amount)}`).join(', ')}`);
  }
  return lines.join('\n');
}

function downloadFile(file, doc) {
  if (!file || !doc?.createElement) return;
  const url = URL.createObjectURL(file);
  const a = doc.createElement('a');
  a.href = url;
  a.download = file.name || 'gagyebu.png';
  doc.body.append(a);
  a.click();
  a.remove?.();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Web Share API. 사용자가 닫으면 'abort'.
 * 공유할 수 없으면 글을 복사하고 이미지가 있으면 저장한 뒤 'copied' 또는 'downloaded'.
 */
export async function shareSummary({ text, file, title, nav = globalThis.navigator, doc = globalThis.document } = {}) {
  const canFiles = !!(file && nav?.canShare?.({ files: [file] }));
  if (typeof nav?.share === 'function') {
    try {
      await nav.share(canFiles ? { title, text, files: [file] } : { title, text });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'abort';
    }
  }
  let copied = false;
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text ?? '');
      copied = true;
    }
  } catch { /* 복사 실패 시 이미지 저장만 */ }
  if (file) downloadFile(file, doc);
  if (copied && file) return 'copied';
  if (copied) return 'copied';
  return file ? 'downloaded' : 'failed';
}
