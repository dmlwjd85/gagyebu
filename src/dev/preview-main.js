// 개발 서버 전용 화면(vite build 입력은 index.html 뿐). 샘플 숫자이며 시세 API를 호출하지 않음.
import '../style.css';
import '../fonts.css';
import { initTheme, toggleTheme, currentTheme } from '../lib/theme.js';
import { applyScale } from '../lib/contentScale.js';
import { fitNums } from '../ui/util.js';
import { topBar } from '../ui/views.js';
import { assetsView, taxView } from '../ui/assetsView.js';

const q = new URLSearchParams(location.search);
localStorage.setItem('theme', q.get('theme') === 'dark' ? 'dark' : 'light');
initTheme();
applyScale(Number(q.get('scale') || 1));

const accounts = [
  { id: 'stock', type: 'stock', institution: '삼성증권', name: '직장인 주식', opened: '2022-03-02', order: 0 },
  { id: 'pension', type: 'pension', institution: '미래에셋', name: '연금저축', opened: '2019-01-15', order: 1 },
  { id: 'irp', type: 'irp', institution: '한국투자', name: 'IRP', opened: '2021-06-01', order: 2 },
  { id: 'isa', type: 'isa', institution: '키움증권', name: '중개형 ISA', opened: '2023-11-01', maturity: '2026-11-20', order: 3 },
  { id: 'dc', type: 'dc', institution: '삼성생명', name: 'DC', opened: '2020-01-01', order: 4 },
  { id: 'civil', type: 'civil', institution: '공무원연금공단', name: '공무원연금', opened: '2015-03-01', expectedPension: 2_150_000, order: 5 },
];
const holdings = [
  { id: 'h1', assetAccountId: 'stock', code: '005930', name: '삼성전자', kind: 'stock', qtyE4: 100_000, avgPrice: 70_000, lastPrice: 71_500, priceDate: '2026-10-16', priceSource: 'dataGoKr' },
  { id: 'h2', assetAccountId: 'stock', code: '069500', name: 'KODEX 200', kind: 'etf', qtyE4: 150_000, avgPrice: 42_000, lastPrice: 45_210, priceDate: '2026-10-16', priceSource: 'dataGoKr' },
  { id: 'h3', assetAccountId: 'stock', name: '삼성글로벌배당펀드', kind: 'fund', qtyE4: 1_205_000, avgPrice: 10_200, lastPrice: 11_050, priceDate: '2026-10-01', priceSource: 'manual' },
  { id: 'h4', assetAccountId: 'pension', name: 'TDF 2045', kind: 'fund', qtyE4: 800_000, avgPrice: 10_000, lastPrice: 12_100, priceDate: '2026-10-10', priceSource: 'manual' },
  { id: 'h5', assetAccountId: 'irp', name: '예금', kind: 'deposit', qtyE4: 10_000, avgPrice: 3_000_000, lastPrice: 3_120_000, priceDate: '2026-10-16', priceSource: 'manual' },
  { id: 'h6', assetAccountId: 'isa', code: '102110', name: 'TIGER 200', kind: 'etf', qtyE4: 300_000, avgPrice: 15_000, lastPrice: 16_200, priceDate: '2026-10-16', priceSource: 'dataGoKr' },
];
const contributions = [
  { id: 'p0', assetAccountId: 'pension', date: '2026-01-10', amount: 1_000_000, deductible: true },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, assetAccountId: 'pension', date: `2026-${String(i + 1).padStart(2, '0')}-25`, amount: 500_000, deductible: true })),
  { id: 'i1', assetAccountId: 'irp', date: '2026-03-02', amount: 3_000_000, deductible: true },
  { id: 'd1', assetAccountId: 'dc', date: '2026-06-15', amount: 500_000, deductible: true },
  { id: 's1', assetAccountId: 'stock', date: '2026-04-01', amount: 200_000, deductible: false },
];

let view = q.get('view') === 'tax' ? 'tax' : 'assets';
let assetOpen = q.get('open') === 'none' ? null : 'stock';
const app = document.getElementById('app');

function draw() {
  const m = {
    today: '2026-10-20', offline: false, viewYm: '2026-10', curYm: '2026-10', sd: 1, dark: currentTheme() === 'dark',
    assetAccounts: accounts, holdings, contributions, assetPrefs: null,
  };
  const body = view === 'tax' ? taxView(m, {}) : assetsView(m, { assetOpen });
  document.body.classList.add('has-frame');
  app.innerHTML = `<div class="aurora" aria-hidden="true"></div><div class="app-frame">
    <div class="app-top"><div class="app-shell">${topBar(m, { month: false })}</div></div>
    <main id="main" class="app-main no-nav" tabindex="-1"><div class="app-shell">${body}</div></main></div>`;
  fitNums(app);
  document.fonts?.ready?.then(() => fitNums(app));
}
app.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.action === 'theme') { toggleTheme(); return draw(); }
  if (t.dataset.nav === 'tax') { view = 'tax'; return draw(); }
  if (t.dataset.nav === 'assets' || t.dataset.nav === 'settings' || t.dataset.nav === 'home') { view = 'assets'; return draw(); }
  if (t.dataset.assetOpen) { assetOpen = assetOpen === t.dataset.assetOpen ? null : t.dataset.assetOpen; return draw(); }
});
draw();
