import { useId } from 'react';

export function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-9 items-center justify-between gap-2 text-sm font-medium text-[var(--ink)]">
      <span>{label}</span>
      <span className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
        <input id={id} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="size-5 cursor-pointer border-0 bg-transparent p-0" />
        <output className="font-mono text-xs text-[var(--ink-muted)]">{value.toUpperCase()}</output>
      </span>
    </label>
  );
}
