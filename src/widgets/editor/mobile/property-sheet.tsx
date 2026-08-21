'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export function PropertySheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => triggerRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-[rgb(44_39_56_/_35%)]" role="presentation" onMouseDown={onClose}>
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full rounded-t-[1.5rem] bg-[var(--surface)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-float)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-lg text-[var(--ink)]">{title}</h2>
          <button ref={closeButtonRef} type="button" aria-label="속성 시트 닫기" onClick={onClose} className="property-touch-target grid size-11 place-items-center rounded-xl text-xl text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
