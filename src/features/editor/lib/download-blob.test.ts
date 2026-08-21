import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { birthdayCardFilename, downloadBlob } from './download-blob';

describe('downloadBlob', () => {
  const createObjectURL = vi.fn(() => 'blob:test-download');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('PNG Blob을 전달한 파일명으로 내려받고 임시 자원을 정리한다', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadBlob(new Blob(['png'], { type: 'image/png' }), 'birthday-local-demo.png');

    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-download');
    expect(document.querySelector('a[download="birthday-local-demo.png"]')).not.toBeInTheDocument();
  });

  it('anchor click이 실패해도 임시 anchor와 object URL을 정리한다', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click failed');
    });

    expect(() => downloadBlob(
      new Blob(['png'], { type: 'image/png' }),
      'birthday-local-demo.png',
    )).toThrow('click failed');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-download');
    expect(document.querySelector('a[download="birthday-local-demo.png"]')).not.toBeInTheDocument();
  });
});

describe('birthdayCardFilename', () => {
  it('카드 ID의 파일명 위험 문자를 안전한 하이픈으로 정규화한다', () => {
    expect(birthdayCardFilename('../내 카드 / 2026')).toBe('birthday-card-2026.png');
  });
});
