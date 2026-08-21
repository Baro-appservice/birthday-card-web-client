'use client';

import { Button } from '@/shared/ui/button';

export function EditorErrorState({
  title,
  description,
  actionLabel = '다시 시도',
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction(): void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--workspace)] p-6 text-center text-[var(--ink)]">
      <section role="alert" className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
        <h1 className="font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
        <Button className="mt-5" variant="primary" onClick={onAction}>{actionLabel}</Button>
      </section>
    </main>
  );
}
