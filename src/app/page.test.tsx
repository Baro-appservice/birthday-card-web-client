import { render, screen } from '@testing-library/react';
import HomePage from './page';

it('로컬 자기 생일 카드 편집기로 이동할 수 있다', () => {
  render(<HomePage />);
  expect(screen.getByRole('link', { name: '내 생일 카드 만들기' }))
    .toHaveAttribute('href', '/editor/local-demo');
});
