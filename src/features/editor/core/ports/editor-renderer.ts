import type { Design, ElementTransformSnapshot } from '@/entities/design';

export type EditorEvent =
  | { type: 'selection:changed'; elementIds: string[] }
  | {
      type: 'element:transformed';
      elementId: string;
      before: ElementTransformSnapshot;
      after: ElementTransformSnapshot;
    }
  | {
      type: 'text:edited';
      elementId: string;
      before: string;
      after: string;
      historyGroup?: string;
    };

export interface EditorElementBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EditorRenderer {
  mount(element: HTMLCanvasElement): void;
  render(design: Design): Promise<void>;
  select(elementIds: string[]): void;
  measureElement?(elementId: string): EditorElementBounds | undefined;
  subscribe(listener: (event: EditorEvent) => void): () => void;
  dispose(): void | Promise<void>;
}
