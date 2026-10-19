import { formatKRW } from './money.js';
document.querySelector('#app').innerHTML = `<h1>가계부</h1><p>이번 달 남은 돈 ${formatKRW(0)}</p>`;
