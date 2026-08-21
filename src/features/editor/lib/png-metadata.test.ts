import { describe, expect, it } from 'vitest';

import { readPngMetadata } from './png-metadata';

function validHeader(width = 1080, height = 1350): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe('readPngMetadata', () => {
  it('전체 8-byte PNG signature와 IHDR에서 크기를 읽는다', () => {
    expect(readPngMetadata(validHeader())).toEqual({ width: 1080, height: 1350 });
  });

  it.each([
    ['최소 길이 미달', validHeader().subarray(0, 23)],
    ['signature 손상', Uint8Array.from(validHeader(), (byte, index) => index === 7 ? 0 : byte)],
    ['IHDR 길이 손상', Uint8Array.from(validHeader(), (byte, index) => index === 11 ? 12 : byte)],
    ['IHDR type 손상', Uint8Array.from(validHeader(), (byte, index) => index === 12 ? 0 : byte)],
  ])('%s을 거부한다', (_name, bytes) => {
    expect(() => readPngMetadata(bytes)).toThrow('PNG');
  });
});
