import { createSampleDesign } from '@/entities/design';
import { UpdateElementCommand } from '@/features/editor/commands/update-element-command';
import { createDesignStore } from '@/features/editor/model/design-store';
import { describe, expect, it } from 'vitest';

import { EditorHistory } from './editor-history';

function titleText(store: ReturnType<typeof createDesignStore>): string {
  const title = store.getState().design.pages[0].elements.find((element) => element.id === 'title');
  if (!title || title.type !== 'text') throw new Error('title 텍스트가 없습니다.');
  return title.text;
}

describe('EditorHistory text coalescing', () => {
  it('같은 텍스트 편집 세션의 연속 변경은 Undo 한 번으로 입력 전 상태로 돌아간다', () => {
    const store = createDesignStore(createSampleDesign());
    const history = new EditorHistory();
    const original = titleText(store);
    const historyGroup = 'text:title:session-1';

    history.execute(new UpdateElementCommand(
      store,
      'page-1',
      'title',
      { text: '생일' },
      historyGroup,
    ));
    history.execute(new UpdateElementCommand(
      store,
      'page-1',
      'title',
      { text: '생일 축하' },
      historyGroup,
    ));
    history.execute(new UpdateElementCommand(
      store,
      'page-1',
      'title',
      { text: '생일 축하해!' },
      historyGroup,
    ));

    expect(titleText(store)).toBe('생일 축하해!');

    history.undo();
    expect(titleText(store)).toBe(original);
    expect(history.canUndo()).toBe(false);

    history.redo();
    expect(titleText(store)).toBe('생일 축하해!');
  });

  it('포커스를 나갔다 다시 시작한 다른 편집 세션은 별도 Undo 단계로 남긴다', () => {
    const store = createDesignStore(createSampleDesign());
    const history = new EditorHistory();
    const original = titleText(store);

    history.execute(new UpdateElementCommand(
      store,
      'page-1',
      'title',
      { text: '첫 번째 세션' },
      'text:title:session-1',
    ));
    history.execute(new UpdateElementCommand(
      store,
      'page-1',
      'title',
      { text: '두 번째 세션' },
      'text:title:session-2',
    ));

    history.undo();
    expect(titleText(store)).toBe('첫 번째 세션');

    history.undo();
    expect(titleText(store)).toBe(original);
  });

  it('같은 history group이어도 다른 element는 병합하지 않는다', () => {
    const store = createDesignStore(createSampleDesign());
    const history = new EditorHistory();
    const group = 'shared-test-group';

    history.execute(new UpdateElementCommand(
      store,
      'page-1',
      'title',
      { text: '제목 변경' },
      group,
    ));
    history.execute(new UpdateElementCommand(
      store,
      'page-1',
      'name',
      { text: '이름 변경' },
      group,
    ));

    history.undo();
    const name = store.getState().design.pages[0].elements.find((element) => element.id === 'name');
    expect(name).toMatchObject({ type: 'text', text: '김생일' });
    expect(titleText(store)).toBe('제목 변경');
  });
});
