function normalizeCardId(cardId: string): string {
  const normalized = cardId
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const capped = Array.from(normalized).slice(0, 80).join('').replace(/-+$/g, '');
  return capped || 'card';
}

export function birthdayCardFilename(cardId: string): string {
  return `birthday-${normalizeCardId(cardId)}.png`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | null = null;
  let primaryError: unknown;
  let hasPrimaryError = false;
  const cleanupErrors: unknown[] = [];

  try {
    link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
  } catch (error) {
    primaryError = error;
    hasPrimaryError = true;
  } finally {
    try {
      if (link) {
        try {
          link.remove();
        } catch (error) {
          cleanupErrors.push(error);
          if (link.parentNode) {
            try {
              link.parentNode.removeChild(link);
            } catch (fallbackError) {
              cleanupErrors.push(fallbackError);
            }
          }
        }
      }
    } finally {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  const errors = hasPrimaryError
    ? [primaryError, ...cleanupErrors]
    : cleanupErrors;
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, 'PNG 다운로드와 임시 자원 정리에 실패했습니다.');
  }
}
