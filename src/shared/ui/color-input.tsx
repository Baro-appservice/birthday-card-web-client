import { useId, useRef } from 'react';

let nextColorInteractionId = 1;

function createInteractionId(): string {
  const id = nextColorInteractionId;
  nextColorInteractionId += 1;
  return `color:${id}`;
}

export function ColorInput({
  label,
  value,
  onChange,
  inputClassName = '',
}: {
  label: string;
  value: string;
  onChange: (color: string, interactionId: string) => void;
  inputClassName?: string;
}) {
  const id = useId();
  const interactionRef = useRef<string | null>(null);
  const ensureInteraction = () => {
    if (!interactionRef.current) interactionRef.current = createInteractionId();
    return interactionRef.current;
  };

  return (
    <label htmlFor={id} className="flex min-h-9 items-center justify-between gap-2 text-sm font-medium text-[var(--ink)]">
      <span>{label}</span>
      <span className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
        <input
          id={id}
          type="color"
          value={value}
          onFocus={() => { interactionRef.current = createInteractionId(); }}
          // A focused native color input can be opened repeatedly without a blur
          // between picker sessions. Treat each pointer activation as a new Undo group.
          onPointerDown={() => { interactionRef.current = createInteractionId(); }}
          onChange={(event) => onChange(event.target.value, ensureInteraction())}
          onBlur={() => { interactionRef.current = null; }}
          className={`size-5 cursor-pointer border-0 bg-transparent p-0 ${inputClassName}`}
        />
        <output className="font-mono text-xs text-[var(--ink-muted)]">{value.toUpperCase()}</output>
      </span>
    </label>
  );
}
