import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createSampleDesign } from '@/entities/design';

import { RecoveryDialog } from './recovery-dialog';

describe('RecoveryDialog', () => {
  it('backup이 있으면 명시적 선택 전에는 저장하지 않고 직전 정상 카드 복구를 요청한다', async () => {
    const user = userEvent.setup();
    const recover = vi.fn().mockResolvedValue(undefined);

    render(
      <RecoveryDialog
        notice={{ reason: 'corrupt', backup: createSampleDesign() }}
        onClose={() => undefined}
        onRecover={recover}
      />,
    );

    expect(screen.getByRole('dialog', { name: '저장된 카드를 복구할까요?' })).toBeVisible();
    expect(screen.getByText('손상된 현재 카드는 선택하기 전까지 덮어쓰지 않습니다.')).toBeVisible();
    expect(recover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '직전 정상 카드 복구' }));

    expect(recover).toHaveBeenCalledWith('backup');
  });

  it('backup이 없으면 샘플 카드로 다시 시작하는 선택만 표시한다', async () => {
    const user = userEvent.setup();
    const recover = vi.fn().mockResolvedValue(undefined);

    render(
      <RecoveryDialog
        notice={{ reason: 'unsupported-version', backup: null }}
        onClose={() => undefined}
        onRecover={recover}
      />,
    );

    expect(screen.queryByRole('button', { name: '직전 정상 카드 복구' })).not.toBeInTheDocument();
    expect(screen.getByText('이 버전에서 열 수 없는 카드이며 사용할 수 있는 정상 백업도 없습니다.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '샘플 카드로 다시 시작' }));
    expect(recover).toHaveBeenCalledWith('sample');
  });
});
