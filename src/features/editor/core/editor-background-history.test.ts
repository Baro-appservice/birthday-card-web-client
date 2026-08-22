import { createSampleDesign } from '@/entities/design';
import { ChangeBackgroundCommand } from '@/features/editor/commands/change-background-command';
import { createDesignStore } from '@/features/editor/model/design-store';
import { describe, expect, it } from 'vitest';

import { EditorHistory } from './editor-history';

function background(store: ReturnType<typeof createDesignStore>) {
  return store.getState().design.pages[0].background;
}

describe('background color history', () => {
  it('같은 color picker interaction의 연속 변경은 Undo 한 번으로 시작 색상까지 돌아간다', () => {
    const store = createDesignStore(createSampleDesign());
    const history = new EditorHistory();
    const original = background(store);

    history.execute(new ChangeBackgroundCommand(store, 'page-1', '#111111', 'color:session'));
    history.execute(new ChangeBackgroundCommand(store, 'page-1', '#222222', 'color:session'));
    history.execute(new ChangeBackgroundCommand(store, 'page-1', '#333333', 'color:session'));

    expect(background(store)).toBe('#333333');
    history.undo();
    expect(background(store)).toBe(original);
  });

  it('다른 color picker interaction은 별도 Undo 단계로 유지한다', () => {
    const store = createDesignStore(createSampleDesign());
    const history = new EditorHistory();
    const original = background(store);

    history.execute(new ChangeBackgroundCommand(store, 'page-1', '#111111', 'color:first'));
    history.execute(new ChangeBackgroundCommand(store, 'page-1', '#222222', 'color:second'));

    history.undo();
    expect(background(store)).toBe('#111111');
    history.undo();
    expect(background(store)).toBe(original);
  });
});
