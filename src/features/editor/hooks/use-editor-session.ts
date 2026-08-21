import { useCallback, useContext, useEffect, useState } from 'react';

import { createSampleDesign } from '@/entities/design';
import { readEmergencyDesign, writeEmergencyDesign } from '@/features/editor/persistence';

import { EditorContext } from '../context/editor-context';

export type EditorSessionStatus = 'loading' | 'ready' | 'recoverable' | 'error';
export type RecoverySource = 'backup' | 'sample';

export interface EditorSession {
  status: EditorSessionStatus;
  recover(source: RecoverySource): Promise<void>;
}

function useEditorSessionContext() {
  const value = useContext(EditorContext);
  if (!value) throw new Error('EditorProvider 내부에서만 편집 세션을 사용할 수 있습니다.');
  return value;
}

export function useEditorSession(cardId: string): EditorSession {
  const { designStore, repository, runtimeStore, saveCoordinator, uiStore } = useEditorSessionContext();
  const [status, setStatus] = useState<EditorSessionStatus>('loading');
  const [loadedCardId, setLoadedCardId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const emergency = readEmergencyDesign(cardId);
    if (emergency) {
      designStore.getState().replaceDesign(emergency);
      runtimeStore.getState().setActivePageId(emergency.pages[0]?.id ?? 'page-1');
      saveCoordinator.schedule(emergency);
      void saveCoordinator.flush();
      setLoadedCardId(cardId);
      setStatus('ready');
      return () => { cancelled = true; };
    }

    void repository.load(cardId)
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'recoverable') {
          uiStore.getState().setRecoveryNotice({
            reason: result.reason,
            backup: result.backup,
          });
          setLoadedCardId(cardId);
          setStatus('recoverable');
          return;
        }

        const design = result.status === 'empty' ? createSampleDesign() : result.design;
        designStore.getState().replaceDesign(design);
        runtimeStore.getState().setActivePageId(design.pages[0]?.id ?? 'page-1');
        if (result.status === 'empty') saveCoordinator.schedule(design);
        setLoadedCardId(cardId);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        uiStore.getState().setError(
          error instanceof Error ? error.message : '카드 문서를 불러오지 못했습니다.',
        );
        setLoadedCardId(cardId);
        setStatus('error');
      });

    return () => { cancelled = true; };
  }, [cardId, designStore, repository, runtimeStore, saveCoordinator, uiStore]);

  const recover = useCallback(async (source: RecoverySource) => {
    const notice = uiStore.getState().recoveryNotice;
    if (!notice) return;
    const design = source === 'backup' && notice.backup ? notice.backup : createSampleDesign();
    designStore.getState().replaceDesign(design);
    runtimeStore.getState().setActivePageId(design.pages[0]?.id ?? 'page-1');
    writeEmergencyDesign(cardId, design);
    saveCoordinator.schedule(design);
    await saveCoordinator.flush();
    uiStore.getState().setRecoveryNotice(null);
    setStatus('ready');
  }, [cardId, designStore, runtimeStore, saveCoordinator, uiStore]);

  return { status: loadedCardId === cardId ? status : 'loading', recover };
}
