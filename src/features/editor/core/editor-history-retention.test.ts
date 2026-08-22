import { describe, expect, it, vi } from 'vitest';

import type { EditorCommand } from './editor-command';
import { EditorHistory } from './editor-history';

function command(label: string, assetIds: string[] = []): EditorCommand {
  return {
    execute: vi.fn(),
    undo: vi.fn(),
    referencedAssetIds: () => new Set(assetIds),
  };
}

describe('EditorHistory retention', () => {
  it('설정한 history limit을 넘으면 가장 오래된 undo command부터 버린다', () => {
    const history = new EditorHistory(3);
    const commands = ['a', 'b', 'c', 'd'].map((label) => command(label));

    commands.forEach((entry) => history.execute(entry));

    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(false);
    expect(commands[0].undo).not.toHaveBeenCalled();
    expect(commands[1].undo).toHaveBeenCalledOnce();
    expect(commands[2].undo).toHaveBeenCalledOnce();
    expect(commands[3].undo).toHaveBeenCalledOnce();
  });

  it('undo와 redo 양쪽 command가 참조하는 asset을 모두 GC 보호 집합에 남긴다', () => {
    const history = new EditorHistory(3);
    history.execute(command('first', ['asset:first-before', 'asset:first-after']));
    history.execute(command('second', ['asset:second']));

    history.undo();

    expect([...history.referencedAssetIds()].sort()).toEqual([
      'asset:first-after',
      'asset:first-before',
      'asset:second',
    ]);
  });

  it('history에서 eviction된 command의 asset은 더 이상 보호하지 않는다', () => {
    const history = new EditorHistory(2);
    history.execute(command('first', ['asset:old']));
    history.execute(command('second', ['asset:kept-1']));
    history.execute(command('third', ['asset:kept-2']));

    expect([...history.referencedAssetIds()].sort()).toEqual([
      'asset:kept-1',
      'asset:kept-2',
    ]);
  });

  it('잘못된 history limit을 생성 시점에 거부한다', () => {
    expect(() => new EditorHistory(0)).toThrow('History limit');
    expect(() => new EditorHistory(1.5)).toThrow('History limit');
  });
});
