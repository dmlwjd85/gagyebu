export const DEFAULT_CATEGORIES = [
  ['food', '🍚', '식비'], ['cafe', '☕', '카페·간식'], ['transit', '🚌', '교통'], ['living', '🛒', '생활·마트'],
  ['housing', '🏠', '주거·관리비'], ['telecom', '📱', '통신·구독'], ['health', '💊', '의료·건강'], ['fashion', '👕', '쇼핑·패션'],
  ['culture', '🎬', '문화·여가'], ['edu', '📚', '교육·책'], ['gift', '🎁', '경조사·선물'], ['etc', '🧾', '기타'],
].map(([id, emoji, name], order) => ({ id, emoji, name, kind: 'expense', order }))
  .concat([
    ['salary', '💼', '월급'], ['bonus', '🎉', '상여·보너스'], ['side', '💸', '부수입'], ['refund', '🔁', '환급·캐시백'],
    ['interest', '🏦', '이자·투자'], ['etc-in', '➕', '기타수입'],
  ].map(([id, emoji, name], order) => ({ id, emoji, name, kind: 'income', order })));

export const DEFAULT_ACCOUNTS = [
  { id: 'card', emoji: '💳', name: '카드', type: 'card' },
  { id: 'cash', emoji: '💵', name: '현금', type: 'cash' },
  { id: 'bank', emoji: '🏦', name: '계좌이체', type: 'bank' },
];
export const FALLBACK_CATEGORY = { expense: 'etc', income: 'etc-in' };
export const EMOJI_CHOICES = '🍚☕🚌🛒🏠📱💊👕🎬📚🎁🧾🍺🍰🚕⛽🅿️✈️🏨🐶👶💄💇🏋️🎮🎵📦🧴🧹💡💧🔥💼🎉💸🔁🏦➕🎓🏥🚗🎨⚽🎂🌱'.match(/\p{Extended_Pictographic}\uFE0F?/gu);

// 시간대 추천: 아침 ☕, 점심 🍚 앞으로 (스펙 4절)
export function suggestOrder(cats, recentIds = [], hour = new Date().getHours()) {
  const boost = hour >= 7 && hour < 11 ? 'cafe' : hour >= 11 && hour < 14 ? 'food' : hour >= 17 && hour < 21 ? 'food' : null;
  const rank = (c) => {
    if (c.id === boost) return -1000;
    const i = recentIds.indexOf(c.id);
    return i >= 0 ? -100 + i : c.order ?? 0;
  };
  return [...cats].sort((a, b) => rank(a) - rank(b));
}
