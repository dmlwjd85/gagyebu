/** 서버가 백업 쓰기를 확인해 줄 때까지 기다릴 시간. 넘기면 이 기기에만 넣고 안내한다. */
export const RESTORE_ACK_MS = 8000;

export const OFFLINE_RESTORE_NOTICE = '오프라인이에요. 백업은 이 기기에 넣어 두고, 연결되면 서버에도 올릴게요.';

/** 온라인이고 서버가 받았으면 완료 문구. 끊겼거나 시간 안에 답이 없으면 대기 안내. */
export function restoreMessage({ online = true, queued = false } = {}) {
  if (online === false || queued) return OFFLINE_RESTORE_NOTICE;
  return '백업을 더했어요.';
}

/**
 * promise가 ms 안에 끝나면 'acked', 아니면 'timeout'.
 * 시간이 지나도 원 프로미스는 끊지 않는다. 로컬에 쌓인 쓰기가 연결되면 올라가게.
 */
export function ackOrTimeout(promise, ms = RESTORE_ACK_MS, clock = globalThis) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = clock.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve('timeout');
    }, ms);
    Promise.resolve(promise).then(
      () => {
        if (settled) return;
        settled = true;
        clock.clearTimeout(timer);
        resolve('acked');
      },
      (err) => {
        if (settled) return;
        settled = true;
        clock.clearTimeout(timer);
        reject(err);
      },
    );
  });
}
