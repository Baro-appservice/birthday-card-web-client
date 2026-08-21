import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import EditorRouteError from './error';

describe('EditorRouteError', () => {
  it('접근 가능한 오류 안내에서 Next reset을 다시 시도한다', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<EditorRouteError error={new Error('render failed')} reset={reset} />);

    expect(screen.getByRole('alert')).toHaveTextContent('편집기를 열지 못했습니다.');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
