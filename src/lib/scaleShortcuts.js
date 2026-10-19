// Ctrl(⌘)+휠·트랙패드 핀치·Ctrl(⌘)+/−/0 을 '본문 글자 배율'로 가로채는 부분만 따로 모은 곳.
// ▶ 이 동작을 끄려면(브라우저 줌을 그대로 쓰게) 아래 한 줄만 false 로 바꾸면 됨. 설정 화면의 슬라이더·가−/가+ 버튼은 그대로 동작.
export const INTERCEPT_BROWSER_ZOOM = true;

import { scaleKeyAction, stepScale } from './contentScale.js';

// getScale: 지금 배율, setScale(next): 배율 바꾸기, blocked(): 시트·대화상자가 열려 있는 등 가로채면 안 될 때 true
// 끝(85%·160%)에 닿았거나 이미 기본이면 가로채지 않고 브라우저 기본 줌에 맡김(접근성: 브라우저 확대는 늘 가능)
export function installScaleShortcuts({ getScale, setScale, blocked = () => false, enabled = INTERCEPT_BROWSER_ZOOM, target = globalThis.window }) {
  if (!enabled || !target) return () => {};
  const onKey = (e) => {
    const a = scaleKeyAction(e);
    if (!a || blocked()) return;
    const cur = getScale();
    const next = a === 'reset' ? 1 : stepScale(cur, a === 'in' ? 1 : -1);
    if (next === cur) return;
    e.preventDefault();
    setScale(next);
  };
  let acc = 0;
  const onWheel = (e) => {
    if (!e.ctrlKey || blocked()) return; // 맥 트랙패드 핀치도 ctrlKey 휠로 들어옴
    const cur = getScale();
    const next = stepScale(cur, e.deltaY < 0 ? 1 : -1);
    if (next === cur) { acc = 0; return; }
    e.preventDefault();
    acc += e.deltaY;
    if (Math.abs(acc) >= 50) { acc = 0; setScale(next); }
  };
  target.addEventListener('keydown', onKey);
  target.addEventListener('wheel', onWheel, { passive: false });
  return () => { target.removeEventListener('keydown', onKey); target.removeEventListener('wheel', onWheel); };
}
