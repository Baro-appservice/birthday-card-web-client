import { useEffect, useRef } from 'react';

import { useEditor } from '@/features/editor/hooks/use-editor';

import styles from './editor-canvas.module.css';

export function EditorCanvas() {
  const editor = useEditor();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mountedRef.current) return;
    mountedRef.current = true;
    void editor.mount(canvas).catch(() => undefined);
  }, [editor]);

  return (
    <div className={styles.frame}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label="생일 카드 편집 캔버스" />
    </div>
  );
}
