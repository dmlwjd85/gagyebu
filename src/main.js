import './style.css';
import { formatKRW } from './money.js';
import { isFirebaseConfigured } from './firebase.js';
document.querySelector('#app').innerHTML = `
  <main class="min-h-screen flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-pink-100 to-sky-100 text-slate-800">
    <h1 class="text-3xl font-bold">가계부</h1>
    <p class="text-lg">이번 달 남은 돈 <span class="font-mono">${formatKRW(0)}</span></p>
    <p class="text-xs text-slate-500">${isFirebaseConfigured ? 'Firebase 연결됨' : 'Firebase 미설정 (.env 필요)'}</p>
  </main>`;
