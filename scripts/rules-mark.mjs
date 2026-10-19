// 규칙 배포 표시(QA 3차 N1·4차 4-3): 규칙 배포에 영향을 주는 파일의 지문(sha256)을 .github/firestore-rules-deployed.sha256에 적어요.
// 지문 대상: firebase.json의 "firestore" 설정(규칙·색인 파일 경로 등)과, 그 설정이 가리키는 파일(firestore.rules, 색인 파일이 있으면 그것도).
//   firebase.json의 에뮬레이터 설정처럼 배포와 상관없는 부분은 넣지 않아요.
// `npm run rules:deploy`가 규칙 배포에 성공한 뒤에만 불러요. 표시 파일을 손으로 고치거나 이 스크립트만 따로 돌리지 마세요(docs/배포.md).
// 사용: node scripts/rules-mark.mjs          → 표시를 지금 지문으로 바꿈(rules:deploy 안에서만)
//       node scripts/rules-mark.mjs --check  → 같으면 0, 다르면 1(바꾸지 않음)
//       node scripts/rules-mark.mjs --print [폴더] → 그 폴더(기본: 저장소)의 지문만 출력
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const repo = new URL('../', import.meta.url);
const MARK = new URL('.github/firestore-rules-deployed.sha256', repo);

// 키 순서와 상관없이 같은 문자열
const canon = (v) => Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v);

export function rulesFingerprint(root = repo) {
  const fb = JSON.parse(readFileSync(new URL('firebase.json', root), 'utf8'));
  const fs = fb.firestore ?? {};
  const files = [...new Set((Array.isArray(fs) ? fs : [fs]).flatMap((x) => [x.rules, x.indexes]).filter(Boolean))].sort();
  const h = createHash('sha256').update(`firebase.json#firestore ${canon(fs)}\n`);
  for (const f of files) h.update(`--- ${f}\n`).update(readFileSync(new URL(f, root))).update('\n');
  return h.digest('hex');
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  const i = process.argv.indexOf('--print');
  if (i >= 0) {
    const dir = process.argv[i + 1] ? pathToFileURL(resolve(process.argv[i + 1]) + '/') : repo;
    console.log(rulesFingerprint(dir)); process.exit(0);
  }
  const hash = rulesFingerprint();
  const marked = (() => { try { return readFileSync(MARK, 'utf8').match(/^[0-9a-f]{64}/m)?.[0] ?? ''; } catch { return ''; } })();
  if (process.argv.includes('--check')) {
    if (marked === hash) { console.log(`규칙 배포 표시가 지금 규칙과 같아요(${hash.slice(0, 12)}).`); process.exit(0); }
    console.log(`규칙 배포 표시(${marked.slice(0, 12) || '없음'})가 지금 규칙(${hash.slice(0, 12)})과 달라요. 규칙을 먼저 배포해 주세요: npm run rules:deploy`);
    process.exit(1);
  }
  writeFileSync(MARK, `${hash}\n# 운영(gagyebu-b44fc2)에 마지막으로 배포한 규칙의 지문(firestore.rules + firebase.json의 firestore 설정). npm run rules:deploy 가 배포에 성공하면 고쳐 써요.\n# 앱 배포(deploy-pages.yml, 서비스 계정 비밀값이 없을 때)는 이 값이 지금 지문과 같을 때만 진행해요. 손으로 고치지 마세요.\n`);
  console.log(`규칙 배포 표시를 ${hash.slice(0, 12)}(으)로 바꿨어요. 이 파일을 커밋해 주세요.`);
}
