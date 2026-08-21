import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function IconButton({
  'aria-label': ariaLabel,
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      type={type}
      aria-label={ariaLabel}
      className={`grid size-9 place-items-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--workspace-deep)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}
