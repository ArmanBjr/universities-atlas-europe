"use client";

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Renders a colour swatch — used for status chips. */
  dot?: string;
  count?: number;
}

export function Chip({ label, active, onClick, dot, count }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${
        active
          ? "border-beacon/60 bg-beacon/15 text-beacon"
          : "border-hairline bg-white/[0.02] text-ink-dim hover:border-hairline-bright hover:bg-white/[0.05] hover:text-ink"
      }`}
    >
      {dot && (
        <span
          aria-hidden
          className="size-2 rounded-full ring-1 ring-black/40"
          style={{ background: dot }}
        />
      )}
      {label}
      {count !== undefined && (
        <span className="tabular text-[10px] text-ink-faint group-hover:text-ink-dim">{count}</span>
      )}
    </button>
  );
}
