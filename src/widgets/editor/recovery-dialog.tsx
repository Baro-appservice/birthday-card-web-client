'use client';

import { useState } from 'react';

import type { RecoverySource } from '@/features/editor/hooks/use-editor-session';
import type { RecoveryNotice } from '@/features/editor/model/editor-ui-store';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';

function recoveryDescription(notice: RecoveryNotice): string {
  if (notice.reason === 'unsupported-version') {
    return notice.backup
      ? '현재 버전에서 열 수 없는 카드입니다. 직전 정상 카드 또는 새 샘플을 선택할 수 있습니다.'
      : '이 버전에서 열 수 없는 카드이며 사용할 수 있는 정상 백업도 없습니다.';
  }
  return notice.backup
    ? '손상된 현재 카드는 선택하기 전까지 덮어쓰지 않습니다.'
    : '저장된 카드가 손상되었으며 사용할 수 있는 정상 백업도 없습니다.';
}

export function RecoveryDialog({
  notice,
  onClose,
  onRecover,
}: {
  notice: RecoveryNotice;
  onClose(): void;
  onRecover(source: RecoverySource): Promise<void>;
}) {
  const [pending, setPending] = useState<RecoverySource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recover = async (source: RecoverySource) => {
    setPending(source);
    setError(null);
    try {
      await onRecover(source);
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : '카드를 복구하지 못했습니다. 다시 시도해 주세요.',
      );
      setPending(null);
    }
  };

  return (
    <Dialog title="저장된 카드를 복구할까요?" onClose={onClose}>
      <p className="text-sm leading-6 text-[var(--ink-muted)]">{recoveryDescription(notice)}</p>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant={notice.backup ? 'secondary' : 'primary'}
          disabled={pending !== null}
          onClick={() => void recover('sample')}
        >
          {pending === 'sample' ? '복구 중' : '샘플 카드로 다시 시작'}
        </Button>
        {notice.backup ? (
          <Button
            variant="primary"
            disabled={pending !== null}
            onClick={() => void recover('backup')}
          >
            {pending === 'backup' ? '복구 중' : '직전 정상 카드 복구'}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
