import { PROJECT_DOCS_URL } from '@app/shared/constants/docs';
import { describe, expect, it } from 'vitest';
import { isDocsFrameUrl } from '../../src/modules/window/docs-embed-policy';

describe('docs embed frame matching', () => {
  it('matches the docs site and its sub-paths', () => {
    expect(isDocsFrameUrl(PROJECT_DOCS_URL)).toBe(true);
    expect(isDocsFrameUrl(`${PROJECT_DOCS_URL}introduction/what-is-this`)).toBe(true);
  });

  it('ignores other origins, error pages and blank frames', () => {
    // 同账号下的其他 GitHub Pages 项目不能被误判
    expect(isDocsFrameUrl('https://banshan-alec.github.io/other-project/')).toBe(false);
    expect(isDocsFrameUrl('https://example.com/electron-react-monorepo-template/')).toBe(false);
    // 加载失败后 Chromium 会把 frame 导航到错误页
    expect(isDocsFrameUrl('chrome-error://chromewebdata/')).toBe(false);
    expect(isDocsFrameUrl('about:blank')).toBe(false);
    expect(isDocsFrameUrl('')).toBe(false);
  });
});
