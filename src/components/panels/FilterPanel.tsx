"use client";

import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { hasActiveFilters } from "@/lib/filter";
import { COUNTRY_PROFILES } from "@/lib/countries";
import {
  ENGLISH_LABEL,
  KIND_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  eur,
} from "@/lib/display";
import { APPLICATION_STATUSES, type EnglishAvailability, type InstitutionKind } from "@/lib/types";
import { Chip } from "../ui/Chip";
import { Slider } from "../ui/Slider";

const KINDS = Object.keys(KIND_LABEL) as InstitutionKind[];
const ENGLISH_LEVELS: EnglishAvailability[] = ["extensive", "moderate", "limited"];

/** Top of the tuition slider — above this the filter is simply "no limit". */
const TUITION_CEILING = 20000;
const LIVING_CEILING = 2000;
const PSW_CEILING = 36;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline px-4 py-3.5 first:border-t-0">
      <h3 className="eyebrow mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

export function FilterPanel({ visibleCount }: { visibleCount: number }) {
  const filters = useAppStore((s) => s.filters);
  const setFilter = useAppStore((s) => s.setFilter);
  const toggleInArray = useAppStore((s) => s.toggleInArray);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const points = useAppStore((s) => s.points);

  const trackedCount = useMemo(() => points.filter((p) => p.status).length, [points]);

  // Only offer countries that actually have institutions in the database.
  const countries = useMemo(() => {
    const present = new Set(points.map((p) => p.countryCode));
    return COUNTRY_PROFILES.filter((c) => present.has(c.code));
  }, [points]);

  const active = hasActiveFilters(filters);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hairline px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl leading-none tracking-tight text-ink">Atlas</h1>
          <span className="tabular text-[11px] text-ink-faint">
            {visibleCount.toLocaleString()} shown
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          European higher education, filtered by what actually decides where you can go.
        </p>

        <input
          type="search"
          value={filters.query}
          onChange={(e) => setFilter("query", e.target.value)}
          placeholder="Search institutions…"
          aria-label="Search institutions by name"
          className="mt-3 w-full rounded-lg border border-hairline bg-black/30 px-3 py-2 text-[13px] text-ink
            placeholder:text-ink-faint focus:border-signal/60 focus:bg-black/40"
        />
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain">
        <Section title="Cost & rights">
          <div className="space-y-3.5">
            <Slider
              label="Max tuition (non-EU)"
              value={filters.maxTuitionNonEu}
              min={0}
              max={TUITION_CEILING}
              step={500}
              format={(v) => `${eur.format(v)}/yr`}
              onChange={(v) => setFilter("maxTuitionNonEu", v)}
            />
            <Slider
              label="Max living cost"
              value={filters.maxLivingCost}
              min={400}
              max={LIVING_CEILING}
              step={50}
              format={(v) => `${eur.format(v)}/mo`}
              onChange={(v) => setFilter("maxLivingCost", v)}
            />
            <Slider
              label="Min post-study work"
              value={filters.minPostStudyWorkMonths}
              min={0}
              max={PSW_CEILING}
              step={3}
              unlimitedLabel="Any"
              format={(v) => `${v} months`}
              onChange={(v) => setFilter("minPostStudyWorkMonths", v === 0 ? null : v)}
            />
          </div>

          <label className="mt-3.5 flex cursor-pointer items-center gap-2 text-[12px] text-ink-dim">
            <input
              type="checkbox"
              checked={filters.euOnly}
              onChange={(e) => setFilter("euOnly", e.target.checked)}
              className="size-3.5 accent-[var(--color-beacon)]"
            />
            EU member states only
          </label>
        </Section>

        <Section title="English-taught master's">
          <div className="flex flex-wrap gap-1.5">
            {ENGLISH_LEVELS.map((level) => (
              <Chip
                key={level}
                label={ENGLISH_LABEL[level]}
                active={filters.englishMasters.includes(level)}
                onClick={() => toggleInArray("englishMasters", level)}
              />
            ))}
          </div>
        </Section>

        <Section title="Institution type">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((kind) => (
              <Chip
                key={kind}
                label={KIND_LABEL[kind]}
                active={filters.kinds.includes(kind)}
                onClick={() => toggleInArray("kinds", kind)}
              />
            ))}
          </div>
        </Section>

        <Section title={`My shortlist${trackedCount ? ` · ${trackedCount}` : ""}`}>
          <label className="mb-2.5 flex cursor-pointer items-center gap-2 text-[12px] text-ink-dim">
            <input
              type="checkbox"
              checked={filters.shortlistedOnly}
              onChange={(e) => setFilter("shortlistedOnly", e.target.checked)}
              className="size-3.5 accent-[var(--color-beacon)]"
            />
            Only tracked institutions
          </label>
          <div className="flex flex-wrap gap-1.5">
            {APPLICATION_STATUSES.map((status) => (
              <Chip
                key={status}
                label={STATUS_LABEL[status]}
                dot={STATUS_COLOR[status]}
                active={filters.statuses.includes(status)}
                onClick={() => toggleInArray("statuses", status)}
              />
            ))}
          </div>
        </Section>

        <Section title={`Countries · ${countries.length}`}>
          <div className="flex flex-wrap gap-1.5">
            {countries.map((c) => (
              <Chip
                key={c.code}
                label={`${c.flag} ${c.code}`}
                active={filters.countries.includes(c.code)}
                onClick={() => toggleInArray("countries", c.code)}
              />
            ))}
          </div>
        </Section>
      </div>

      {active && (
        <footer className="border-t border-hairline p-3">
          <button
            type="button"
            onClick={resetFilters}
            className="w-full rounded-lg border border-hairline bg-white/[0.03] py-2 text-[12px]
              font-medium text-ink-dim transition-colors hover:border-hairline-bright hover:text-ink"
          >
            Clear all filters
          </button>
        </footer>
      )}
    </div>
  );
}
