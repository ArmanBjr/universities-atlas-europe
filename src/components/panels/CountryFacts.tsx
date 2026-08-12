"use client";

import { ENGLISH_LABEL, eur, formatMonths, formatRange, num } from "@/lib/display";
import type { CountryProfile } from "@/lib/types";

function Fact({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-hairline py-2 first:border-t-0">
      <dt className="shrink-0 text-[11px] leading-snug text-ink-faint">{label}</dt>
      <dd className="text-right">
        <span
          className={`tabular text-[12.5px] ${emphasis ? "font-medium text-beacon" : "text-ink-dim"}`}
        >
          {value}
        </span>
        {hint && <span className="block text-[10px] leading-snug text-ink-faint">{hint}</span>}
      </dd>
    </div>
  );
}

/**
 * The whole point of the app: the national rules that decide whether an
 * institution is actually reachable, shown next to the institution itself.
 */
export function CountryFacts({ country }: { country: CountryProfile }) {
  const membership = [country.eu ? "EU" : null, country.schengen ? "Schengen" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className="text-base leading-none">
          {country.flag}
        </span>
        <span className="text-[13px] font-medium text-ink">{country.name}</span>
        {membership && (
          <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[10px] text-ink-faint">
            {membership}
          </span>
        )}
      </div>

      <dl>
        <Fact
          label="Tuition — non-EU"
          value={formatRange(country.tuitionNonEu)}
          hint="per year, public institutions"
          emphasis
        />
        <Fact label="Tuition — EU/EEA" value={formatRange(country.tuitionEu)} hint="per year" />
        {country.semesterFee && (
          <Fact
            label="Semester fee"
            value={formatRange(country.semesterFee)}
            hint="mandatory even where tuition is free"
          />
        )}
        <Fact label="Living cost" value={`${formatRange(country.livingCostPerMonth)} / mo`} />
        {country.healthInsurancePerMonth !== null && (
          <Fact
            label="Health insurance"
            value={`${eur.format(country.healthInsurancePerMonth)} / mo`}
          />
        )}
        {country.proofOfFundsPerYear !== null && (
          <Fact
            label="Proof of funds"
            value={eur.format(country.proofOfFundsPerYear)}
            hint="blocked account or equivalent, per year"
            emphasis
          />
        )}
        <Fact
          label="Post-study work"
          value={formatMonths(country.postStudyWorkMonths)}
          hint="stay-back to find a job"
          emphasis
        />
        {country.workHoursPerWeek !== null && (
          <Fact label="Work while studying" value={`${num.format(country.workHoursPerWeek)} h / week`} />
        )}
        {country.permanentResidenceYears !== null && (
          <Fact
            label="Permanent residence"
            value={`${country.permanentResidenceYears} years`}
            hint="of legal residence, earliest case"
          />
        )}
        <Fact label="English master's" value={ENGLISH_LABEL[country.englishMasters]} />
        {country.studentVisaName && <Fact label="Permit" value={country.studentVisaName} />}
        <Fact label="Languages" value={country.languages.join(", ")} />
      </dl>

      {country.notes && (
        <p className="mt-2.5 border-l-2 border-signal/40 pl-2.5 text-[11px] leading-relaxed text-ink-dim">
          {country.notes}
        </p>
      )}

      <p className="mt-2.5 text-[10px] text-ink-faint">
        Policy reviewed {country.lastReviewed}. Always confirm against the official immigration
        portal before you rely on it.
      </p>
    </div>
  );
}
