// 규칙 배포 표시: 지금 firestore.rules의 sha256을 .github/firestore-rules-deployed.sha256에 적음(QA 3차 N1).
// `npm run rules:deploy`가 규칙 배포에 성공한 뒤에만 부름. 앱 배포 워크플로는 이 값이 firestore.rules와 같을 때만 앱을 배포해요.
// 사용: node scripts/rules-mark.mjs        → 표시를 지금 규칙으로 바꿈
//       node scripts/rules-mark.mjs --check → 같으면 0, 다르면 1(바꾸지 않음)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const MARK = new URL('.github/firestore-rules-deployed.sha256', root);
const hash = createHash('sha256').update(readFileSync(new URL('firestore.rules', root))).digest('hex');
const marked = (() => { try { return readFileSync(MARK, 'utf8').match(/^[0-9a-f]{64}/m)?.[0] ?? ''; } catch { return ''; } })();

if (process.argv.includes('--check')) {
  if (marked === hash) { console.log(`규칙 배포 표시가 지금 규칙과 같아요(${hash.slice(0, 12)}).`); process.exit(0); }
  console.log(`규칙 배포 표시(${marked.slice(0, 12) || '없음'})가 지금 규칙(${hash.slice(0, 12)})과 달라요. 규칙을 먼저 배포해 주세요: npm run rules:deploy`);
  process.exit(1);
}
writeFileSync(MARK, `${hash}\n# 운영(gagyebu-b44fc2)에 마지막으로 배포한 firestore.rules의 sha256. npm run rules:deploy 가 배포에 성공하면 고쳐 써요.\n# 앱 배포(deploy-pages.yml)는 이 값이 firestore.rules와 같을 때만 진행해요. 손으로 고치지 마세요.\n`);
console.log(`규칙 배포 표시를 ${hash.slice(0, 12)}(으)로 바꿨어요. 이 파일을 커밋해 주세요.`);
