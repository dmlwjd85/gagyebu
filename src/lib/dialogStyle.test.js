import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('대화상자 대비', () => {
  const css = readFileSync('src/style.css', 'utf8');
  const util = readFileSync('src/ui/util.js', 'utf8');
  const report = readFileSync('src/ui/report.js', 'utf8');

  test('확인·금액·폼·리포트가 같은 카드와 버튼 줄을 쓴다', () => {
    expect(util).toContain('class="dlg-card"');
    expect(util).toContain('class="dlg-actions"');
    expect(report).toContain('class="dlg-card"');
    expect(report).toContain('class="dlg-actions"');
    expect(util).not.toContain('bg-black/40');
  });

  test('바탕은 어둡게, 카드는 테두리로 라이트·다크를 가른다', () => {
    expect(css).toMatch(/\.dlg-wrap \{\s*background: rgba\(15, 14, 26, 0\.62\)/);
    expect(css).toContain('html.dark .dlg-wrap { background: rgba(0, 0, 0, 0.78); }');
    expect(css).toContain('--dlg-surface: #3A3460');
    expect(css).toContain('border-color: #C8C2E4');
    expect(css).toMatch(/@media \(max-height: 700px\) \{\s*\.dlg-wrap\.dlg-wrap \{ padding-top: 8px; padding-bottom: 8px; \}/);
  });
});
