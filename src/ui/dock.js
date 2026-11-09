// 아래 독(쨈 교무수첩 하단 독과 같은 디자인·동작): 클레이 알약 바 + 오목한 홈 안의 키캡 6칸 + 가운데 솟은 쨈 키캡('기록').
// - 짧게 누르면 그 화면으로(또는 계산기·더 보기), 길게(0.52초) 누르면 '칸 배치 바꾸기'. 손가락을 10px 넘게 움직이면 길게 누르기 취소.
// - 지금 화면 칸은 눌린 키캡(쨈 색). 스크롤해도 숨지 않음(높이가 아주 낮은 화면만 예전처럼 숨김).
// - PC(1024px~)는 왼쪽 세로 메뉴에 같은 키캡 칸, '기록'은 본문 아래 가운데에 따로 뜸.
import { esc } from './util.js';
import { DOCK_POOL, SIDE_COUNT, dockItem, activeDockId, dockPool } from '../lib/dockSlots.js';

export const HOLD_MS = 520;
export const MOVE_PX = 10;

const P = (d) => `<path d="${d}"/>`;
/** 24칸 선 아이콘(키캡 위 글자색을 따라감) */
export const DOCK_ICONS = {
  home: P('M4 11.2 12 4l8 7.2V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.2H9v5.2H5.5A1.5 1.5 0 0 1 4 19z'),
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/>' + P('M8 3.5v4M16 3.5v4M4 10.5h16'),
  chart: P('M5 20V12M10 20V6M15 20v-9M20 20V9') + P('M3.5 20.5h17'),
  budget: '<rect x="3.5" y="6.5" width="17" height="13" rx="2.5"/>' + P('M15 13h5.5M6.5 6.5 15 3.8l1.2 2.7') + '<circle cx="16.2" cy="13" r=".6"/>',
  calc: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/>' + P('M8 7.5h8M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01'),
  more: P('M6 12h.01M12 12h.01M18 12h.01'),
  assets: P('M4 17l5-5 3.5 3.5L20 8') + P('M15 8h5v5'),
  tax: P('M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z') + P('M9 8.5h6M9 12h6M9 15.5h3'),
  search: '<circle cx="10.5" cy="10.5" r="6"/>' + P('M15 15l5 5'),
  recurring: P('M19 9a7.5 7.5 0 0 0-13.4-2M5 15a7.5 7.5 0 0 0 13.4 2') + P('M5.5 3.5v3.7h3.7M18.5 20.5v-3.7h-3.7'),
  import: P('M12 4v10M8 10l4 4 4-4') + P('M4.5 14.5V19A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-4.5'),
  settings: '<circle cx="12" cy="12" r="3"/>' + P('M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6'),
};
export const dockIcon = (id, cls = 'dock-svg') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${DOCK_ICONS[id] ?? ''}</svg>`;

function keyAttrs(item) {
  if (item.view) return `data-nav="${esc(item.view)}"`;
  if (item.action === 'calc') return 'data-action="calc"';
  return 'data-action="dock-more" aria-haspopup="dialog"';
}

/** 옆 칸 하나 */
export function dockKey(id, on, here = '') {
  const item = dockItem(id);
  if (!item) return '';
  const label = item.name === item.label ? item.label : `${item.label}(${item.name})`;
  // '더'는 메뉴를 여는 단추라 aria-current="page" 대신 지금 화면 이름을 접근 이름에 덧붙임
  const isMore = item.action === 'more';
  const name = (item.name === item.label ? item.label : item.name) + (on && isMore && here ? ` (지금 화면: ${here})` : '');
  const cur = on ? (isMore ? 'aria-current="true"' : 'aria-current="page"') : '';
  return `<button type="button" class="tab dock-key${on ? ' on' : ''}" data-dock="${esc(id)}" ${keyAttrs(item)} ${cur} aria-label="${esc(name)}" aria-describedby="dock-hint" title="${esc(label)}"><span class="dock-well" aria-hidden="true"><span class="dock-cap">${dockIcon(id)}</span></span><span class="dock-label" aria-hidden="true">${esc(item.label)}</span></button>`;
}

/** 독 본체. mid = 가운데 '기록' 버튼 HTML(main.js 가 넘김) */
export function dockHtml({ view, order, mid, logo = '' }) {
  const on = activeDockId(order, view);
  const here = DOCK_POOL.find((t) => t.view === view)?.name ?? '';
  const side = (ids) => ids.map((id) => dockKey(id, id === on, here)).join('');
  return `<nav class="tabbar dock" aria-label="주요 화면">
  ${logo}<span id="dock-hint" hidden>길게 누르면 칸 배치를 바꿀 수 있어요.</span>
  ${side(order.slice(0, 3))}
  ${mid}
  ${side(order.slice(3, SIDE_COUNT))}</nav>`;
}

/** '더' 메뉴: 모든 화면·도구. 지금 화면은 표시 */
export function dockMenuHtml({ view, features = {} }) {
  const items = dockPool(features).filter((t) => t.id !== 'more');
  return `<div class="dock-sheet-grab" aria-hidden="true"></div>
    <h2 id="dock-menu-t" class="text-head">모든 메뉴</h2>
    <ul class="dock-menu" role="list">
      ${items.map((t) => {
        const cur = t.view && t.view === view;
        return `<li><button type="button" class="dock-menu-item${cur ? ' on' : ''}" data-menu="${esc(t.id)}" ${cur ? 'aria-current="page"' : ''}><span class="dock-menu-cap" aria-hidden="true">${dockIcon(t.id)}</span><span class="min-w-0 break-words">${esc(t.name)}</span></button></li>`;
      }).join('')}
    </ul>
    <p class="text-caption text-ink-sub mt-2 break-words">아래 칸을 길게 누르면 자주 쓰는 메뉴로 바꿀 수 있어요.</p>
    <div class="dlg-actions"><button type="button" class="btn-ghost" data-menu-close>닫기</button></div>`;
}

const SLOT_NAMES = ['왼쪽 첫째', '왼쪽 둘째', '왼쪽 셋째', '오른쪽 첫째', '오른쪽 둘째', '오른쪽 셋째'];

/** 칸 배치 바꾸기 */
export function dockEditHtml({ draft, features = {} }) {
  const pool = dockPool(features);
  return `<div class="dock-sheet-grab" aria-hidden="true"></div>
    <h2 id="dock-edit-t" class="text-head">아래 칸 배치 바꾸기</h2>
    <p class="dlg-copy">가운데 '기록'은 그대로 두고, 양옆 여섯 칸을 골라요. 이 기기에만 저장돼요.</p>
    <ol class="dock-slots">
      ${draft.map((id, slot) => `<li class="dock-slot">
        <label class="dock-slot-name" for="dock-slot-${slot}">${SLOT_NAMES[slot]}</label>
        <select id="dock-slot-${slot}" class="select dock-select" data-slot="${slot}">
          ${pool.map((t) => `<option value="${esc(t.id)}" ${t.id === id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select>
        <button type="button" class="icon-btn dock-move" data-move="${slot}" data-dir="-1" aria-label="${SLOT_NAMES[slot]} 칸을 앞으로" ${slot === 0 ? 'disabled' : ''}>‹</button>
        <button type="button" class="icon-btn dock-move" data-move="${slot}" data-dir="1" aria-label="${SLOT_NAMES[slot]} 칸을 뒤로" ${slot === SIDE_COUNT - 1 ? 'disabled' : ''}>›</button>
      </li>`).join('')}
    </ol>
    ${draft.includes('more') ? '' : '<p class="text-caption text-ink-sub mt-1 break-words" data-dock-nomore>「더」 칸을 빼도 괜찮아요. 위 ⚙️ 설정에서 모든 화면에 갈 수 있어요.</p>'}
    <div class="dlg-actions dock-edit-foot">
      <button type="button" class="btn-ghost" data-dock-reset>기본 배치</button>
      <button type="button" class="btn-ghost" data-dock-cancel>닫기</button>
      <button type="button" class="btn-primary" data-dock-save>저장</button>
    </div>`;
}

export { DOCK_POOL };
