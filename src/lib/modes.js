// 쓰는 방식(1인 가구·부부·학생)과 기능 스위치.
// 모드 문서가 없는 기존 사용자는 지금 보이는 메뉴를 그대로 둔다.
// 부부 거래 주인(owner)은 선택 필드다. 없는 거래는 '나'로 읽고, 여기에서는 문서를 고치지 않는다.
import { clampStartDay } from './dates.js';

export const MODES = [
  { id: 'single', label: '1인 가구', emoji: '🏠', blurb: '월세·구독, 월급날, 오늘·이번 주 몫' },
  { id: 'couple', label: '부부', emoji: '💑', blurb: '나·배우자·공동과 비율 정산' },
  { id: 'student', label: '학생', emoji: '🎓', blurb: '용돈, 저금통, 한도, 알바·심부름' },
];

export const FEATURES = [
  { id: 'recurring', label: '반복 고정지출', hint: '월세·구독은 그날 자동으로, 같은 달은 한 번만', group: 'single' },
  { id: 'monthStart', label: '월급날 시작', hint: '한 달 합계와 예산 기간을 월급날에 맞춰요', group: 'single' },
  { id: 'weekDaily', label: '오늘·이번 주 몫', hint: '한 달 예산을 날마다 나눈 몫. 큰 숫자와는 계산이 달라요', group: 'single' },
  { id: 'sms', label: '카드 문자 붙여넣기', hint: '문자를 붙여 바로 기록', group: 'single' },
  { id: 'allowance', label: '용돈 주기', hint: '다음 용돈까지 하루 몫', group: 'student' },
  { id: 'piggy', label: '저금통', hint: '모으는 목표', group: 'student' },
  { id: 'categoryLimits', label: '카테고리 한도', hint: '한도에 가까우면 알려요', group: 'student' },
  { id: 'studentIncome', label: '알바·심부름', hint: '수입 카테고리', group: 'student' },
  { id: 'monthShare', label: '월간 요약 공유', hint: '글과 이미지로 공유', group: 'student' },
  { id: 'txOwner', label: '거래별 누구 돈', hint: '나·배우자·공동. 공동 지출은 비율로 정산해요', group: 'couple' },
];

export const FEATURE_IDS = FEATURES.map((f) => f.id);
const MODE_IDS = new Set(MODES.map((m) => m.id));

export const MODE_DEFAULTS = {
  single: { recurring: true, monthStart: true, weekDaily: true, sms: true, allowance: false, piggy: false, categoryLimits: false, studentIncome: false, monthShare: false, txOwner: false },
  couple: { recurring: false, monthStart: false, weekDaily: false, sms: false, allowance: false, piggy: false, categoryLimits: false, studentIncome: false, monthShare: false, txOwner: true },
  student: { recurring: false, monthStart: false, weekDaily: false, sms: false, allowance: true, piggy: true, categoryLimits: true, studentIncome: true, monthShare: true, txOwner: false },
};

/** 모드를 고르기 전. 이미 있는 메뉴만 켜고, 이번 PR에서 새로 넣은 카드는 숨긴다. */
export const LEGACY_FEATURES = {
  recurring: true,
  monthStart: true,
  weekDaily: false,
  sms: true,
  allowance: false,
  piggy: true,
  categoryLimits: true,
  studentIncome: false,
  monthShare: true,
  txOwner: false,
};

/** 거래에 붙이는 선택 필드. 값은 '나' | '배우자' | '공동'. 없으면 '나'로 읽는다. */
export const COUPLE_OWNER_FIELD = 'owner';
export const COUPLE_OWNER_IMPLEMENTED = true;

export function coupleOwnerHook(tx = null) {
  const owner = tx?.owner === '배우자' || tx?.owner === '공동' || tx?.owner === '나' ? tx.owner : '나';
  return { field: COUPLE_OWNER_FIELD, implemented: COUPLE_OWNER_IMPLEMENTED, tx, owner };
}

export const STUDENT_INCOME = [
  { id: 'part-time', emoji: '💼', name: '알바', kind: 'income', order: 20 },
  { id: 'errand', emoji: '🛵', name: '심부름', kind: 'income', order: 21 },
];

export function defaultsFor(mode) {
  return { ...(MODE_DEFAULTS[mode] ?? LEGACY_FEATURES) };
}

/**
 * @param {object|null} settings users/{uid}/settings/prefs. 없으면 기존 화면.
 * 모드가 있을 때만 features 맵으로 기능을 섞는다.
 * 모드가 없어도 features에 불리언이 있으면 그 값만 덮어 쓴다(설정에서 하나씩 켠 경우).
 */
export function resolveMode(settings) {
  const mode = settings && MODE_IDS.has(settings.mode) ? settings.mode : null;
  const features = mode ? defaultsFor(mode) : { ...LEGACY_FEATURES };
  const over = settings?.features;
  if (over && typeof over === 'object') {
    for (const id of FEATURE_IDS) {
      if (typeof over[id] === 'boolean') features[id] = over[id];
    }
  }
  // 모드를 고르기 전에는 '지금 보이는 것'을 끄지 않는다. 켜기(새 기능)만 허용.
  if (!mode && over && typeof over === 'object') {
    for (const id of FEATURE_IDS) {
      if (LEGACY_FEATURES[id] && features[id] === false) features[id] = true;
    }
  }
  return { mode, legacy: !mode, features, askMode: !!(settings?.askMode && !mode) };
}

export function featureOn(features, id) {
  if (!features) return !!LEGACY_FEATURES[id];
  return !!features[id];
}

/**
 * 화면·조회에 쓰는 한 달 시작일.
 * 월급날 메뉴가 꺼져 있으면 1일. 프로필에 저장된 값은 바꾸지 않는다.
 */
export function effectiveStartDay(stored, features) {
  if (!featureOn(features, 'monthStart')) return 1;
  return clampStartDay(stored ?? 1);
}

export function settingsForMode(mode) {
  if (!MODE_IDS.has(mode)) throw new Error('unknown mode');
  return { mode, askMode: false, features: defaultsFor(mode) };
}

export function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (MODE_IDS.has(raw.mode)) out.mode = raw.mode;
  if (typeof raw.askMode === 'boolean') out.askMode = raw.askMode;
  if (raw.features && typeof raw.features === 'object' && !Array.isArray(raw.features)) {
    const features = {};
    for (const id of FEATURE_IDS) if (typeof raw.features[id] === 'boolean') features[id] = raw.features[id];
    if (Object.keys(features).length) out.features = features;
  }
  if (Number.isInteger(raw.allowanceAmount) && raw.allowanceAmount >= 0 && raw.allowanceAmount <= 10_000_000_000) out.allowanceAmount = raw.allowanceAmount;
  if (raw.allowanceCycle === 'week' || raw.allowanceCycle === 'month') out.allowanceCycle = raw.allowanceCycle;
  if (Number.isInteger(raw.allowanceWeekday) && raw.allowanceWeekday >= 0 && raw.allowanceWeekday <= 6) out.allowanceWeekday = raw.allowanceWeekday;
  if (Number.isInteger(raw.allowanceDay) && raw.allowanceDay >= 1 && raw.allowanceDay <= 28) out.allowanceDay = raw.allowanceDay;
  if (typeof raw.spouseName === 'string') {
    const name = raw.spouseName.trim();
    if (name.length >= 1 && name.length <= 20 && !/[\n\r]/.test(name)) out.spouseName = name;
  }
  if (Number.isInteger(raw.splitMe) && raw.splitMe >= 0 && raw.splitMe <= 100) out.splitMe = raw.splitMe;
  return out;
}

export function allowanceFrom(settings) {
  const s = normalizeSettings(settings) ?? {};
  return {
    amount: s.allowanceAmount ?? 0,
    cycle: s.allowanceCycle ?? 'month',
    weekday: s.allowanceWeekday ?? 1,
    day: s.allowanceDay ?? 1,
  };
}
