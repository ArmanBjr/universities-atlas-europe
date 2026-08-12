"use client";

interface SliderProps {
  label: string;
  /** `null` means "no limit" and is represented by the far end of the track. */
  value: number | null;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  unlimitedLabel?: string;
  onChange: (value: number | null) => void;
}

/**
 * A max-value slider where the top of the range means "don't filter at all".
 * Folding the off-state into the track avoids a separate enable checkbox.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  unlimitedLabel = "Any",
  onChange,
}: SliderProps) {
  const current = value ?? max;
  const isUnlimited = value === null;
  const pct = ((current - min) / (max - min)) * 100;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-[11px] font-medium text-ink-dim">{label}</label>
        <span className={`tabular text-[11px] ${isUnlimited ? "text-ink-faint" : "text-beacon"}`}>
          {isUnlimited ? unlimitedLabel : format(current)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        aria-label={label}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(v >= max ? null : v);
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none
          [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink
          [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(0,0,0,0.5)]
          [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-115
          [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink"
        style={{
          background: `linear-gradient(to right, var(--color-beacon) 0%, var(--color-beacon) ${pct}%, var(--color-hairline) ${pct}%, var(--color-hairline) 100%)`,
        }}
      />
    </div>
  );
}
