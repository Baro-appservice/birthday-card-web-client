function normalizeCardId(cardId: string): string {
  const normalized = cardId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!normalized) return 'card';
  return normalized === cardId ? normalized : `card-${normalized}`;
}

export function birthdayCardFilename(cardId: string): string {
  return `birthday-${normalizeCardId(cardId)}.png`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
