import { useEffect, useRef } from 'react';

import {
  useEditor,
  useEditorRuntimeStore,
  useEditorUiStore,
} from '@/features/editor/hooks/use-editor';

import styles from './editor-canvas.module.css';

export function EditorCanvas() {
  const editor = useEditor();
  const setCanvasStatus = useEditorRuntimeStore((state) => state.setCanvasStatus);
  const setError = useEditorUiStore((state) => state.setError);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mountedRef.current) return;
    mountedRef.current = true;
    void editor.mount(canvas).catch((error: unknown) => {
      setCanvasStatus('error');
      setError(error instanceof Error ? error.message : '캔버스를 시작하지 못했습니다.');
    });
  }, [editor, setCanvasStatus, setError]);

  return (
    <div className={styles.frame} data-testid="editor-canvas-frame" data-layout-contract="4:5-fit-container">
      <canvas ref={canvasRef} className={styles.canvas} aria-label="생일 카드 편집 캔버스" />
    </div>
  );
}
