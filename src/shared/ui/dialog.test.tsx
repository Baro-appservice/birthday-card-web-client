import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Dialog } from './dialog';

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>열기</button>
      {open ? <Dialog title="카드 삭제" onClose={() => setOpen(false)}><button type="button">확인</button><button type="button">취소</button></Dialog> : null}
    </>
  );
}

describe('Dialog', () => {
  it('열릴 때 포커스를 가두고 Escape로 닫은 뒤 trigger로 돌려준다', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole('button', { name: '열기' });

    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: '카드 삭제' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '대화상자 닫기' })).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: '대화상자 닫기' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
