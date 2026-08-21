'use client';

import { EditorErrorState } from '@/widgets/editor/editor-error-state';

export default function EditorRouteError({ reset }: {
  error: Error & { digest?: string };
  reset(): void;
}) {
  return (
    <EditorErrorState
      title="편집기를 열지 못했습니다."
      description="카드 편집기를 준비하는 중 문제가 생겼습니다. 현재 페이지에서 다시 시도해 주세요."
      onAction={reset}
    />
  );
}
