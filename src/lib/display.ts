import type { ApplicationStatus, EnglishAvailability, InstitutionKind } from "./types";

/**
 * Hex duplicates of the `--color-st-*` tokens in globals.css. MapLibre paint
 * expressions are evaluated in WebGL and cannot read CSS custom properties, so
 * the two lists have to be kept in step by hand.
 */
export const STATUS_COLOR: Record<ApplicationStatus, string> = {
  interested: "#8b93a7",
  shortlisted: "#69b0e8",
  preparing: "#54c4d4",
  applied: "#d9b23f",
  interview: "#e5943f",
  admitted: "#4fc487",
  enrolled: "#3fc98f",
  rejected: "#e06a5c",
  declined: "#736d92",
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  interested: "Interested",
  shortlisted: "Shortlisted",
  preparing: "Preparing",
  applied: "Applied",
  interview: "Interview",
  admitted: "Admitted",
  rejected: "Rejected",
  enrolled: "Enrolled",
  declined: "Declined",
};

export const KIND_LABEL: Record<InstitutionKind, string> = {
  university: "University",
  applied_sciences: "Applied sciences",
  technical: "Technical",
  art_music: "Art & music",
  business: "Business",
  medical: "Medical",
  other: "Other",
};

export const ENGLISH_LABEL: Record<EnglishAvailability, string> = {
  extensive: "Extensive",
  moderate: "Moderate",
  limited: "Limited",
};

/** Untracked institutions render in this neutral tone. */
export const UNTRACKED_COLOR = "#5b6478";

export const eur = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export const num = new Intl.NumberFormat("en-GB");

/** "€0" and "€0–3,000" read better than a repeated identical range. */
export function formatRange(range: { min: number; max: number } | null): string {
  if (!range) return "—";
  if (range.min === range.max) return eur.format(range.min);
  return `${eur.format(range.min)}–${eur.format(range.max)}`;
}

export function formatMonths(months: number | null): string {
  if (months === null) return "None";
  if (months === 0) return "None";
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? "" : "s"}`;
  return `${months} months`;
}
