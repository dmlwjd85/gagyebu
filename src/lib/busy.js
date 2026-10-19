// 지금 화면을 다시 불러오면 사용자가 하던 일이 사라지는지(새 버전 적용, QA 3차 N3·4차 4-1).
// 입력 시트는 로그인 뒤 늘 DOM에 있는 빈 <section class="sheet" role="dialog">라서, 열려 있는지는 sheetOpen(클래스 'open')으로만 봐요.
// 그 밖의 대화상자(확인·금액·필터·리포트)는 열 때 만들고 닫을 때 지우므로, 화면에 보이는 것만 '열림'으로 봐요.
const DIALOGS = '[role=alertdialog],[role=dialog]:not(.sheet)';
const shown = (el) => el.isConnected && !el.hidden && !el.closest('[hidden],[inert]') && el.getAttribute('aria-hidden') !== 'true';

/**
 * @param {object} o
 * @param {Document} o.doc
 * @param {boolean} o.signedIn 로그인 전 화면은 지울 입력이 없음
 * @param {boolean} o.sheetOpen 입력 시트가 열려 있는지(isSheetOpen)
 * @param {boolean} [o.importing] 가져오기 2단계 이상 진행 중
 */
export function isBusyNow({ doc, signedIn, sheetOpen, importing = false }) {
  if (!signedIn) return false;
  if (sheetOpen || importing) return true;
  if ([...doc.querySelectorAll(DIALOGS)].some(shown)) return true;
  const a = doc.activeElement;
  return !!(a?.matches?.('input,textarea') && a.type !== 'file' && a.value);
}
