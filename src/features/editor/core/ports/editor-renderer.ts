import type { Design, TransformSnapshot } from '@/entities/design';

export type EditorEvent =
  | { type: 'selection:changed'; elementIds: string[] }
  | {
      type: 'element:transformed';
      elementId: string;
      before: TransformSnapshot;
      after: TransformSnapshot;
    }
  | { type: 'text:edited'; elementId: string; before: string; after: string };

export interface EditorRenderer {
  mount(element: HTMLCanvasElement): void;
  render(design: Design): Promise<void>;
  select(elementIds: string[]): void;
  subscribe(listener: (event: EditorEvent) => void): () => void;
  dispose(): void;
}
