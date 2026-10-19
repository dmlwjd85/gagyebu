import './style.css';
import { isFirebaseConfigured } from './firebase.js';
import { initTheme, toggleTheme, currentTheme } from './theme.js';

initTheme();
const won = (n) => `${Math.trunc(n).toLocaleString('ko-KR')}원`;
const icon = () => (currentTheme() === 'dark' ? '☀️' : '🌙');

document.querySelector('#app').innerHTML = `
  <div class="fixed inset-0 -z-10 bg-aurora" aria-hidden="true"></div>
  <main class="mx-auto max-w-md min-h-screen px-4 pt-4 pb-10 flex flex-col gap-3">
    <header class="flex items-center justify-between">
      <h1 class="text-title">10월</h1>
      <button id="theme-btn" class="glass w-11 h-11 !rounded-full grid place-items-center text-lg" aria-label="다크 모드 전환">${icon()}</button>
    </header>
    <section class="hero-card px-5 pt-[18px] pb-4">
      <p class="text-caption font-semibold">☀️ 맑음 · 여유 있어요</p>
      <p class="text-body mt-2">오늘 쓸 수 있는 돈</p>
      <p class="text-display tabular-nums mt-1">${won(0)}</p>
      <div class="mt-3 h-2 rounded-full bg-white/25"><div class="h-2 w-0 rounded-full bg-white"></div></div>
      <div class="mt-2 flex justify-between text-caption tabular-nums"><span>이번 달 예산 0% 사용</span><span>예산 미설정</span></div>
    </section>
    <section class="grid grid-cols-3 gap-2">
      <div class="glass p-3"><p class="text-caption text-ink-sub">지출</p><p class="text-head tabular-nums text-expense">−${won(0)}</p></div>
      <div class="glass p-3"><p class="text-caption text-ink-sub">수입</p><p class="text-head tabular-nums text-income">+${won(0)}</p></div>
      <div class="glass p-3"><p class="text-caption text-ink-sub">남긴 돈</p><p class="text-head tabular-nums">${won(0)}</p></div>
    </section>
    <p class="text-caption text-ink-sub text-center mt-2">${isFirebaseConfigured ? 'Firebase 연결됨' : 'Firebase 미설정 (.env 필요)'}</p>
  </main>`;

const btn = document.querySelector('#theme-btn');
btn.addEventListener('click', () => { toggleTheme(); btn.textContent = icon(); });
