const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const IHDR_TYPE = [0x49, 0x48, 0x44, 0x52] as const;
const MINIMUM_HEADER_LENGTH = 24;

export function readPngMetadata(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < MINIMUM_HEADER_LENGTH) {
    throw new Error('PNG header 길이가 너무 짧습니다.');
  }
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error('PNG signature가 올바르지 않습니다.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || !IHDR_TYPE.every((byte, index) => bytes[12 + index] === byte)) {
    throw new Error('PNG IHDR chunk가 올바르지 않습니다.');
  }
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
