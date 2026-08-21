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
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-download');
    expect(document.querySelector('a[download="birthday-local-demo.png"]')).not.toBeInTheDocument();
  });

  it('anchor 생성이 실패해도 생성된 object URL을 정확히 한 번 정리한다', () => {
    vi.spyOn(document, 'createElement').mockImplementationOnce(() => {
      throw new Error('create failed');
    });

    expect(() => downloadBlob(
      new Blob(['png'], { type: 'image/png' }),
      'birthday-local-demo.png',
    )).toThrow('create failed');
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-download');
    expect(document.querySelector('a[download]')).not.toBeInTheDocument();
  });

  it('anchor 속성 설정이 실패해도 anchor와 object URL을 정리한다', () => {
    const remove = vi.spyOn(HTMLAnchorElement.prototype, 'remove');
    vi.spyOn(HTMLAnchorElement.prototype, 'href', 'set').mockImplementation(() => {
      throw new Error('setter failed');
    });

    expect(() => downloadBlob(
      new Blob(['png'], { type: 'image/png' }),
      'birthday-local-demo.png',
    )).toThrow('setter failed');
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-download');
    expect(document.querySelector('a[download]')).not.toBeInTheDocument();
  });

  it('anchor append가 실패해도 anchor와 object URL을 정리한다', () => {
    const remove = vi.spyOn(HTMLAnchorElement.prototype, 'remove');
    vi.spyOn(document.body, 'append').mockImplementationOnce(() => {
      throw new Error('append failed');
    });

    expect(() => downloadBlob(
      new Blob(['png'], { type: 'image/png' }),
      'birthday-local-demo.png',
    )).toThrow('append failed');
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-download');
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
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-download');
    expect(document.querySelector('a[download="birthday-local-demo.png"]')).not.toBeInTheDocument();
  });

  it('anchor remove가 실패하면 fallback으로 DOM을 정리하고 revoke를 계속한다', () => {
    const remove = vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => {
      throw new Error('remove failed');
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(() => downloadBlob(
      new Blob(['png'], { type: 'image/png' }),
      'birthday-local-demo.png',
    )).toThrow('remove failed');
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-download');
    expect(document.querySelector('a[download="birthday-local-demo.png"]')).not.toBeInTheDocument();
  });

  it('primary와 cleanup이 함께 실패하면 모든 원인을 보존하고 두 cleanup을 시도한다', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click failed');
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => {
      throw new Error('remove failed');
    });
    revokeObjectURL.mockImplementationOnce(() => {
      throw new Error('revoke failed');
    });

    let caught: unknown;
    try {
      downloadBlob(new Blob(['png']), 'birthday-local-demo.png');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'click failed' }),
      expect.objectContaining({ message: 'remove failed' }),
      expect.objectContaining({ message: 'revoke failed' }),
    ]);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-download');
    expect(document.querySelector('a[download="birthday-local-demo.png"]')).not.toBeInTheDocument();
  });

  it('undefined를 throw한 primary 실패도 cleanup 실패와 함께 보존한다', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw undefined;
    });
    revokeObjectURL.mockImplementationOnce(() => {
      throw new Error('revoke failed');
    });

    let caught: unknown;
    try {
      downloadBlob(new Blob(['png']), 'birthday-local-demo.png');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      undefined,
      expect.objectContaining({ message: 'revoke failed' }),
    ]);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:test-download');
    expect(document.querySelector('a[download="birthday-local-demo.png"]')).not.toBeInTheDocument();
  });
});

describe('birthdayCardFilename', () => {
  it('서로 다른 한국어 카드 ID를 보존해 충돌하지 않는다', () => {
    expect(birthdayCardFilename('생일카드')).toBe('birthday-생일카드.png');
    expect(birthdayCardFilename('초대장')).toBe('birthday-초대장.png');
  });

  it('traversal과 예약 문자를 제거하고 separator를 하나로 합친다', () => {
    expect(birthdayCardFilename('../내 카드 / 2026')).toBe('birthday-내-카드-2026.png');
  });

  it('control과 예약 문자를 파일명에서 제거한다', () => {
    expect(birthdayCardFilename('\u0000초대\u001f장?:*')).toBe('birthday-초대-장.png');
  });

  it('안전한 내용이 없으면 card fallback을 사용한다', () => {
    expect(birthdayCardFilename('../\u0000?:*')).toBe('birthday-card.png');
  });

  it('Unicode code point 단위로 제한해 surrogate pair를 쪼개지 않는다', () => {
    const filename = birthdayCardFilename(`${'가'.repeat(79)}𐐀나`);
    const id = filename.slice('birthday-'.length, -'.png'.length);

    expect(Array.from(id)).toHaveLength(80);
    expect(id.endsWith('𐐀')).toBe(true);
  });
});
