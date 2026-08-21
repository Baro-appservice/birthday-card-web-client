import type { ReactNode } from 'react';

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-[rgb(44_39_56_/_35%)] p-4" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-5 shadow-[var(--shadow-float)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-lg text-[var(--ink)]">{title}</h2>
          <button type="button" aria-label="대화상자 닫기" onClick={onClose} className="text-[var(--ink-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
