import { createSampleDesign, type DesignElement } from '@/entities/design';
import { createDesignStore, type DesignStore } from '@/features/editor/model/design-store';
import { describe, expect, it, vi } from 'vitest';

import { CompositeEditorCommand, type EditorCommand } from './editor-command';
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

  it('undo 실행이 실패해도 undo 기록을 보존한다', () => {
    const history = new EditorHistory();
    const command = createSpyCommand();
    vi.mocked(command.undo).mockImplementation(() => { throw new Error('undo failed'); });
    history.execute(command);

    expect(() => history.undo()).toThrow('undo failed');

    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('redo 실행이 실패해도 redo 기록을 보존한다', () => {
    const history = new EditorHistory();
    const command = createSpyCommand();
    history.execute(command);
    history.undo();
    vi.mocked(command.execute).mockImplementation(() => { throw new Error('redo failed'); });

    expect(() => history.redo()).toThrow('redo failed');

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });
});

describe('CompositeEditorCommand', () => {
  it('execute 중 실패하면 이미 실행된 명령을 역순으로 보상한다', () => {
    const state: string[] = [];
    const first: EditorCommand = {
      execute: () => { state.push('first'); },
      undo: () => { state.pop(); },
    };
    const second: EditorCommand = {
      execute: () => { throw new Error('second failed'); },
      undo: vi.fn(),
    };

    expect(() => new CompositeEditorCommand([first, second]).execute()).toThrow('second failed');
    expect(state).toEqual([]);
  });

  it('undo 중 실패하면 이미 되돌린 명령을 다시 실행해 원자성을 지킨다', () => {
    const state: string[] = [];
    const first: EditorCommand = {
      execute: () => { state.push('first'); },
      undo: () => { throw new Error('first undo failed'); },
    };
    const second: EditorCommand = {
      execute: () => { state.push('second'); },
      undo: () => { state.pop(); },
    };
    const command = new CompositeEditorCommand([first, second]);
    command.execute();

    expect(() => command.undo()).toThrow('first undo failed');
    expect(state).toEqual(['first', 'second']);
  });

  it('execute 보상도 실패하면 원래 오류와 보상 오류를 함께 노출한다', () => {
    const original = new Error('execute failed');
    const compensation = new Error('execute compensation failed');
    const command = new CompositeEditorCommand([
      { execute: vi.fn(), undo: () => { throw compensation; } },
      { execute: () => { throw original; }, undo: vi.fn() },
    ]);

    let caught: unknown;
    try {
      command.execute();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([original, compensation]);
  });

  it('undo 보상도 실패하면 원래 오류와 보상 오류를 함께 노출한다', () => {
    const original = new Error('undo failed');
    const compensation = new Error('undo compensation failed');
    const command = new CompositeEditorCommand([
      { execute: vi.fn(), undo: () => { throw original; } },
      { execute: () => { throw compensation; }, undo: vi.fn() },
    ]);

    let caught: unknown;
    try {
      command.undo();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([original, compensation]);
  });
});

describe('TransformElementCommand', () => {
  it('비텍스트 transform command는 before와 after를 정확히 왕복한다', () => {
    const store = createDesignStore(createSampleDesign());
    const command = new TransformElementCommand(store, 'page-1', 'top-decoration', {
      before: { x: 70, y: 56, width: 940, height: 250, rotation: 0 },
      after: { x: 90, y: 80, width: 800, height: 220, rotation: 8 },
    });

    command.execute();
    expect(findElement(store, 'top-decoration')).toMatchObject({
      x: 90, y: 80, width: 800, height: 220, rotation: 8,
    });

    command.undo();
    expect(findElement(store, 'top-decoration')).toMatchObject({
      x: 70, y: 56, width: 940, height: 250, rotation: 0,
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
