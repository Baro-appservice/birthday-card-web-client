import { createSampleDesign, type DesignElement } from '@/entities/design';
import { createDesignStore, type DesignStore } from '@/features/editor/model/design-store';
import { describe, expect, it, vi } from 'vitest';

import type { EditorCommand } from './editor-command';
import { EditorHistory } from './editor-history';
import { AddElementCommand } from '../commands/add-element-command';
import { TransformElementCommand } from '../commands/transform-element-command';

const createSpyCommand = (): EditorCommand => ({
  execute: vi.fn(),
  undo: vi.fn(),
});

const findElement = (store: DesignStore, elementId: string): DesignElement => {
  const element = store.getState().design.pages[0].elements
    .find((candidate) => candidate.id === elementId);
  if (!element) throw new Error(`테스트 요소가 없습니다: ${elementId}`);
  return element;
};

describe('EditorHistory', () => {
  it('새 명령을 실행하면 redo 기록을 비운다', () => {
    const history = new EditorHistory();
    const first = createSpyCommand();
    const second = createSpyCommand();

    history.execute(first);
    history.undo();
    history.execute(second);

    expect(history.canRedo()).toBe(false);
    expect(first.execute).toHaveBeenCalledTimes(1);
    expect(first.undo).toHaveBeenCalledTimes(1);
    expect(second.execute).toHaveBeenCalledTimes(1);
  });

  it('undo한 명령을 redo로 다시 실행한다', () => {
    const history = new EditorHistory();
    const command = createSpyCommand();

    history.execute(command);
    history.undo();
    history.redo();

    expect(command.execute).toHaveBeenCalledTimes(2);
    expect(history.canUndo()).toBe(true);
  });

  it('기록이 없으면 undo와 redo를 안전하게 무시한다', () => {
    const history = new EditorHistory();

    history.undo();
    history.redo();

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});

describe('TransformElementCommand', () => {
  it('transform command는 before와 after를 정확히 왕복한다', () => {
    const store = createDesignStore(createSampleDesign());
    const command = new TransformElementCommand(store, 'page-1', 'title', {
      before: { x: 180, y: 140, width: 720, height: 180, rotation: 0 },
      after: { x: 220, y: 180, width: 680, height: 170, rotation: 8 },
    });

    command.execute();
    expect(findElement(store, 'title')).toMatchObject({
      x: 220, y: 180, width: 680, height: 170, rotation: 8,
    });

    command.undo();
    expect(findElement(store, 'title')).toMatchObject({
      x: 180, y: 140, width: 720, height: 180, rotation: 0,
    });
  });
});

describe('AddElementCommand', () => {
  it('생성 시점의 삽입 위치를 캡처해 redo에도 같은 레이어 위치를 유지한다', () => {
    const store = createDesignStore(createSampleDesign());
    const command = new AddElementCommand(store, 'page-1', {
      id: 'captured-position',
      type: 'shape',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      opacity: 1,
      shape: 'circle',
      fill: '#ffffff',
    });

    store.getState().addElement('page-1', {
      id: 'intervening',
      type: 'shape',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      opacity: 1,
      shape: 'circle',
      fill: '#ffffff',
    });
    command.execute();

    expect(store.getState().design.pages[0].elements.map((element) => element.id).slice(-2))
      .toEqual(['captured-position', 'intervening']);
  });
});
