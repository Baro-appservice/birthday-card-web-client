import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand)] text-white shadow-sm hover:bg-[var(--brand-strong)]',
  secondary: 'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)]',
  ghost: 'text-[var(--ink-muted)] hover:bg-[var(--workspace-deep)] hover:text-[var(--ink)]',
  danger: 'bg-[var(--danger)] text-white hover:bg-[var(--danger-strong)]',
};

export function Button({
  variant = 'secondary', className = '', type = 'button', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      type={type}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${variantClasses[variant]} ${className}`}
    />
  );
}
