// QA M2 3차(9.3/10) 결함별 재발 방지 테스트. ID는 /workspace/qa-gagyebu-m2-3차/보고서.md 기준
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { spendParts, spendText, minusWon, percents, rateNote, compactWon, formatWon } from './money.js';
import { totals, filterPeriod, trend, moneyWeather, byDay, noSpendDays, topIncrease } from './stats.js';
import { period, shiftYm } from './dates.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS } from './defaults.js';
import { homeView, chartView, budgetView, calendarView, topBar } from '../ui/views.js';
import { searchView, recurringView } from '../ui/m2views.js';
import { reportData } from '../ui/report.js';
import { recTxId } from './recurring.js';

// QA 재현: 10월 지출 40,000 + 9월 결제(89,000)의 10월 환불 −89,000, 8월은 환불만 3건, 10월 수입 100,000
const T = (date, amount, categoryId, kind = 'expense', extra = {}) => ({ id: `${date}${categoryId}${amount}`, date, amount, kind, categoryId, accountId: 'card', ...extra });
const TXS = [
  T('2026-09-05', 89000, 'fashion', 'expense', { memo: '무신사' }), T('2026-09-06', 30000, 'food'),
  T('2026-10-10', 40000, 'food', 'expense', { memo: '장보기' }), T('2026-10-12', -89000, 'fashion', 'expense', { memo: '무신사 환불', importHash: '0123456789abcdef' }),
  T('2026-10-01', 100000, 'salary', 'income'),
  T('2026-08-03', -20000, 'fashion', 'expense', { importHash: '0123456789abcde1' }), T('2026-08-04', -15000, 'health', 'expense', { importHash: '0123456789abcde2' }),
  T('2026-08-05', -10000, 'fashion', 'expense', { importHash: '0123456789abcde3' }),
];
const cats = DEFAULT_CATEGORIES ?? [];
function model(viewYm, { txs = TXS, budget = null, today = '2026-10-19', extra = {} } = {}) {
  const sd = 1, p = period(viewYm, sd), periodTxs = filterPeriod(txs, p), tot = totals(periodTxs);
  const prevTxs = filterPeriod(txs, period(shiftYm(viewYm, -1), sd));
  return { sd, today, curYm: '2026-10', viewYm, p, periodTxs, tot, budget, txLoaded: true, user: null,
    categories: cats, accounts: DEFAULT_ACCOUNTS ?? [], rules: [], recurring: [], goals: [], imports: [], txs, searchPool: txs,
    catMap: new Map(cats.map((c) => [c.id, c])), accMap: new Map((DEFAULT_ACCOUNTS ?? []).map((a) => [a.id, a])),
    weather: moneyWeather({ budget: budget?.total ?? 0, periodTxs, p, today }),
    trend: trend(txs, [-5, -4, -3, -2, -1, 0].map((d) => period(shiftYm(viewYm, d), sd))), streak: 0, noSpend: 0,
    insight: topIncrease(periodTxs, prevTxs), wide: false, dark: false, themeMode: 'system', offline: false, ...extra };
}
const unwrapNum = (html) => html.replace(/<span data-fit class="num tabular-nums">([^<]*)<\/span>/g, '$1'); // 문장 속 금액 감싸개(QA L6)는 글자만
const text = (html) => unwrapNum(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// 모든 화면 공통 금지 표기: 빼기 두 번, '−0원', 음수 지출(−49,000·−45,000), 100 넘는 비율 합
const BAD = [/[−-]\s*[−-]\s*\d/, /−0원/, /지출\s*−\s*4[59],000/, /총지출\s*−/];
function noBadSigns(html) { const t = text(html); for (const re of BAD) expect(t, `${re} in: ${t.slice(0, 300)}`).not.toMatch(re); }

describe('N10 환불이 지출보다 많은 달의 지출 표기', () => {
  test('spendParts·spendText·minusWon: 지출은 0원 밑으로 안 내려가고 환불은 따로', () => {
    expect(spendParts(-49000)).toEqual({ spent: 0, refund: 49000 });
    expect(spendParts(40000)).toEqual({ spent: 40000, refund: 0 });
    expect(spendText(-49000)).toBe('0원 · 환불 +49,000원');
    expect(spendText(-1234567, compactWon)).toBe('0원 · 환불 +123만원');
    expect(spendText(40000)).toBe('40,000원');
    expect(minusWon(-49000)).toBe('0원');
    expect(minusWon(40000, compactWon)).toBe('−40,000원');
    expect(minusWon(0)).toBe('0원');
  });
  test('홈 요약 카드: "0원 환불 4.9만" 한 줄(360px 높이 유지), 환불 글자 표시(R7), 빼기 겹침·말줄임 없음', () => {
    const m = model('2026-10');
    expect(m.tot.expense).toBe(-49000);
    const h = homeView(m);
    noBadSigns(h);
    expect(h).toContain('aria-label="지출 0원, 환불 49,000원이 더 많아요"');
    expect(text(h)).toMatch(/지출 0원 환불 4\.9만/);
    expect(h).toContain('>환불 4.9만</span>');
    expect(text(h)).not.toMatch(/0원 \+4\.9만/);
    expect(h).toContain('whitespace-nowrap');
  });
  test('8월(환불만): 홈·차트·예산·달력·검색 모두 음수 지출 표기 없음', () => {
    const m = model('2026-08', { budget: { total: 300000 } });
    expect(m.tot.expense).toBe(-45000);
    for (const html of [homeView(m), chartView(m, {}), chartView(m, { chartKind: 'saved' }), budgetView(m, { envelopes: true }), calendarView(m, {}), calendarView(m, { mode: 'list' }),
      searchView(m, { search: { q: '', kind: 'expense', range: 'all' } })]) noBadSigns(html);
  });
  test('차트 남긴 돈 카드·6개월 요약도 0원 + 환불 따로', () => {
    const m = model('2026-10');
    const saved = chartView(m, { chartKind: 'saved' });
    noBadSigns(saved);
    expect(text(saved)).toMatch(/지출 0원 환불 \+49,000원/);
    expect(text(saved)).toMatch(/지출 0원 · 환불 \+49,000원/); // 6개월 추이 아래 요약
  });
  test('저축률 100% 초과는 친절한 설명 문구(차트·리포트), 100% 이하는 없음', () => {
    const m = model('2026-10');
    const note = rateNote(m.tot);
    expect(note).toContain('149%');
    expect(note).toContain('49,000원');
    expect(note).toMatch(/환불/);
    expect(text(chartView(m, { chartKind: 'saved' }))).toContain(note);
    expect(rateNote({ income: 100000, expense: 40000 })).toBeNull();
    expect(rateNote({ income: 0, expense: -5000 })).toBeNull();
    const d = reportData(m);
    expect(d.note).toBe(note);
    expect(d).toMatchObject({ spent: 0, refund: 49000, rate: 149 });
  });
  test('리포트: 지난달 비교는 쓴 돈끼리(−49,000 vs 119,000 → −100%), 지출 줄은 0원·환불', () => {
    const d = reportData(model('2026-10'));
    expect(d.diff).toBe(-100);
    expect(spendText(d.expense)).toBe('0원 · 환불 +49,000원');
    expect(reportData(model('2026-09')).diff).toBeNull(); // 8월 쓴 돈 0원 → 비교 안 함
  });
  test('예산: 환불이 더 많아도 사용 0%, 남은 예산이 예산보다 커지지 않음', () => {
    const m = model('2026-10', { budget: { total: 300000 } });
    const t = text(budgetView(m, {}));
    expect(t).toMatch(/0% 사용/);
    expect(t).toContain('300,000원 남았어요');
    expect(t).toContain('환불 +49,000원이 지출보다 많아 사용 0원으로 봐요');
    expect(m.weather.usedPct).toBe(0);
    expect(m.weather.remaining).toBe(300000);
  });
  test('돈 날씨: 오늘 들어온 환불은 이전 지출에서 빼고, 오늘 쓴 돈은 0 밑으로 안 내려감', () => {
    const p = period('2026-10', 1);
    const w = moneyWeather({ budget: 310000, periodTxs: [T('2026-10-01', 50000, 'food'), T('2026-10-19', -80000, 'fashion')], p, today: '2026-10-19' });
    expect(w.spentToday).toBe(0);
    expect(w.spent).toBe(0);
    expect(w.available).toBe(w.base);
  });
  test('달력: 환불만 있는 날은 무지출·히트맵 0·"+금액", 같은 날 상쇄는 무지출 아님(noSpendDays와 같은 기준)', () => {
    const txs = [T('2026-10-03', -20000, 'fashion'), T('2026-10-04', 5000, 'food'), T('2026-10-04', -5000, 'food'), T('2026-10-05', 3000, 'cafe')];
    const m = model('2026-10', { txs });
    const html = calendarView(m, {});
    const cell = (d) => { const i = html.indexOf(`data-date="${d}"`); return html.slice(html.lastIndexOf('<button', i), html.indexOf('</button>', i)); };
    expect(cell('2026-10-03')).toContain('heat-0');
    expect(cell('2026-10-05')).toContain('heat-4');
    expect(cell('2026-10-03')).toContain('환불 20,000원');
    expect(cell('2026-10-03')).toContain('무지출');
    expect(cell('2026-10-03')).toContain('+2만');
    expect(cell('2026-10-04')).not.toContain('무지출');
    expect(byDay(txs)['2026-10-04']).toMatchObject({ expense: 0, spent: true });
    expect(noSpendDays(txs, period('2026-10', 1), '2026-10-06')).toBe(3); // 1·2·3일(3일은 환불만)
    const list = text(calendarView(m, { mode: 'list' }));
    expect(list).toContain('환불 +20,000원');
    noBadSigns(calendarView(m, { mode: 'list' }));
  });
  test('검색 합계: 환불만 걸리면 "지출 0원 · 환불 +X원"', () => {
    const m = model('2026-10');
    expect(text(searchView(m, { search: { q: '환불', range: 'all' } }))).toContain('지출 0원 · 환불 +89,000원');
  });
});

describe('N11 카테고리 비율 합 100(최대 나머지 방식)', () => {
  test('QA 재현 63+25+13=101 → 합 100, 데모 52+17+10+8+6+4+2=99 → 100', () => {
    expect(percents([50000, 20000, 10000])).toEqual([63, 25, 12]);
    const demo = percents([52.4, 17.4, 10.4, 8.4, 6.4, 3.6, 1.4].map((x) => x * 1000));
    expect(demo.reduce((a, x) => a + x, 0)).toBe(100);
    for (const n of [1, 2, 3, 6, 7, 13]) {
      const vals = Array.from({ length: n }, (_, i) => 1000 + i * 337);
      expect(percents(vals).reduce((a, x) => a + x, 0)).toBe(100);
    }
    expect(percents([])).toEqual([]);
    expect(percents([0, -5])).toEqual([0, 0]);
    expect(percents([1, 1, 1])).toEqual([34, 33, 33]);
  });
  test('차트 범례 % 합 = 100(그 밖의 묶음 포함)', () => {
    const txs = ['food', 'cafe', 'living', 'transport', 'shopping', 'fashion', 'health', 'culture'].map((c, i) => T('2026-10-0' + (i % 9 + 1), 10000 + i * 1777, c));
    const html = chartView(model('2026-10', { txs }), {});
    const pcts = [...html.matchAll(/min-w-\[2\.5rem\] text-right">(\d+)%/g)].map((x) => Number(x[1]));
    expect(pcts.length).toBe(7);
    expect(pcts.reduce((a, x) => a + x, 0)).toBe(100);
    const q = chartView(model('2026-10', { txs: [T('2026-10-01', 50000, 'food'), T('2026-10-02', 20000, 'living'), T('2026-10-03', 10000, 'cafe'), T('2026-10-04', -40000, 'fashion', 'expense', { importHash: '0123456789abcdef' })] }), {});
    expect([...q.matchAll(/min-w-\[2\.5rem\] text-right">(\d+)%/g)].map((x) => Number(x[1]))).toEqual([63, 25, 12]);
  });
});

describe('N12 환불만 있는 달의 차트', () => {
  test('빈 도넛·"총지출 −45,000원"·"0원 기준" 대신 안내 문구 하나', () => {
    const html = chartView(model('2026-08'), {});
    const t = text(html);
    expect(t).toContain('이 달에는 환불만 있어요 (+45,000원)');
    expect(html).not.toContain('<svg viewBox="0 0 220 220"');
    expect(t).not.toContain('0원 기준');
    expect(t).not.toMatch(/총지출/);
    expect(t).toContain('환불이 더 많은 카테고리'); // 카테고리별 환불은 그대로 보임
  });
  test('지출이 남은 카테고리는 있지만 전체가 환불 초과인 달: 도넛 가운데 0원 + 이유 한 줄', () => {
    const t = text(chartView(model('2026-10'), {}));
    expect(t).toMatch(/총지출 0원/);
    expect(t).toContain('환불이 지출보다 49,000원 많아서 이 달 총지출은 0원으로 봐요');
    noBadSigns(t);
  });
});

describe('N13 긴 이름(공백 없는 20자) 넘침 방지 구조', () => {
  const css = readFileSync('src/style.css', 'utf8');
  test('select는 부모 폭 안(min-w-0·max-w-full), 옵션 줄 글자는 줄지 않음', () => {
    expect(css).toMatch(/\.select \{[^}]*min-w-0[^}]*max-w-full/);
    // 이름표는 줄지 않고(shrink-0), 줄 전체 폭보다 길 때만(160px 같은 아주 좁은 폭) 이름표 안에서 줄바꿈(PR #9 QA)
    expect(css).toMatch(/\.opt-row > \.opt-k \{[^}]*shrink-0[^}]*max-w-full/);
  });
  test('라벨+select 줄은 모두 opt-row(가져오기 결제수단·금액 부호). 월급날은 타일', () => {
    const src = ['src/ui/importer.js', 'src/ui/views.js'].map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/<label class="flex items-center justify-between[^"]*">[^<]+<select/);
    expect(src.match(/<label class="opt-row"><span class="opt-k">/g).length).toBe(3);
    expect(src).toContain('class="day-grid"');
    expect(src).not.toContain('data-start-day aria-label');
  });
  test('반복 목록: 금액을 이름 아랫줄로(이름 칸이 금액에 눌리지 않음)', () => {
    const html = recurringView(model('2026-10', { extra: { recurring: [{ id: 'r', name: '가'.repeat(30), amount: 17000, kind: 'expense', categoryId: 'food', dayOfMonth: 5, active: true, startYm: '2026-10' }] } }));
    expect(html).toMatch(/block text-body t-quiet break-words">가{30}<\/span>\s*<span class="block text-body font-bold tabular-nums/);
  });
});

describe('음수·환불 표기 전수 점검(소스 grep)', () => {
  const files = readdirSync('src/ui').filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(`src/ui/${f}`, 'utf8')]);
  test('지출 합계를 formatWon/compactWon에 바로 넘기지 않음(spendText·spendParts·minusWon 경유)', () => {
    for (const [f, s] of files) {
      expect(s, f).not.toMatch(/(formatWon|compactWon)\((m\.tot\.expense|tot\.expense|r\.expense|d\.expense|exp|expense)\)/);
      expect(s, f).not.toMatch(/'−'\s*:\s*''\)\s*\+\s*compactWon/);
    }
  });
});

describe('추가로 찾은 것', () => {
  test('진행 링 0%는 채움 원을 그리지 않음(둥근 끝 점이 남던 문제)', async () => {
    const { ring } = await import('../ui/charts.js');
    expect(ring(0)).not.toContain('ring-fill');
    expect(ring(-0.3)).not.toContain('ring-fill');
    expect(ring(0.5)).toContain('ring-fill');
  });
  test('지난 달 화면 위 막대: 360px에서는 "이번 달로" 대신 ↩ 아이콘(가로 30px 넘침)', () => {
    const html = topBar(model('2026-08'));
    // 줌 대응(위 메뉴 고정): 오프라인 표시가 있어도 430px 폰까지 한 줄에 들어가도록 기준을 480px로 올림
    expect(html).toContain('max-[479px]:hidden">이번 달로');
    expect(html).toContain('min-[480px]:hidden">↩');
    expect(html).toContain('is-past'); // 좁은 폰에서는 심볼을 숨겨 자리 확보
    expect(html).toMatch(/aria-label="[^"]+, 이번 달로 이동"/); // 화면 읽기 프로그램에는 그대로 안내
    expect(topBar(model('2026-10'))).not.toContain('↩');
  });
  test('히트맵: 음수(환불만 있는 날)는 0단계', async () => {
    const { heatLevel } = await import('./stats.js');
    expect(heatLevel(-20000, 50000)).toBe(0);
    expect(heatLevel(50000, 50000)).toBe(4);
    expect(heatLevel(10, 0)).toBe(0);
  });
});

describe('QA 4차 낮음·표기', () => {
  test('예산 카테고리 환불 문구에 +', () => {
    const m = model('2026-10', { budget: { total: 300000, byCategory: { fashion: 30000 } } });
    // 쇼핑·패션에 환불 −89000 → envelope refund
    expect(unwrapNum(budgetView(m, { envelopes: true }))).toContain('환불 +89,000원이 더 많아 사용 0원으로 봐요');
  });
  test('리포트 스티커: 연속 0일이면 제외', () => {
    const d = reportData(model('2026-10'));
    expect(d.streak).toBe(0);
    // drawReport chips 구성은 소스에서 확인
    const src = readFileSync('src/ui/report.js', 'utf8');
    expect(src).toMatch(/d\.streak > 0 \? .*연속 기록/);
  });
});

describe('R1 recTxId 형식(앱·규칙 공통)', () => {
  test('rec-{id}-{YYYY-MM}', () => {
    expect(recTxId('r31', '2026-11')).toBe('rec-r31-2026-11');
    expect(recTxId('Xk3J9aZ0qLm2nB7cD4eF', '2027-02')).toBe('rec-Xk3J9aZ0qLm2nB7cD4eF-2027-02');
  });
});
