import test from 'node:test';
import assert from 'node:assert/strict';
import { siteLinks } from '../src/site-links';

const existing = { downloadUrl: 'https://example.org/download.zip', repositoryUrl: 'https://example.org/repository' };
test('video is the first header link and existing links keep their order', () => {
  assert.deepEqual(siteLinks({ ...existing, videoUrl: 'https://youtu.be/Ra5o6pisiKY' }), [
    ['https://youtu.be/Ra5o6pisiKY', '사용 영상 보기'],
    [existing.downloadUrl, '프로그램 내려받기(zip)'],
    [existing.repositoryUrl, 'GitHub에서 보기·포크'],
  ]);
});
test('missing, empty, placeholder and unsafe video URLs hide only the video link', () => {
  for (const videoUrl of [undefined, '', 'TODO-URL', 'http://example.org/video', 'javascript:alert(1)']) {
    assert.deepEqual(siteLinks({ ...existing, videoUrl }), siteLinks(existing));
  }
  assert.deepEqual(siteLinks({}), []);
});
test('relative video URL follows the existing local-link rule', () => {
  assert.deepEqual(siteLinks({ videoUrl: './video.html' }), [['./video.html', '사용 영상 보기']]);
});
