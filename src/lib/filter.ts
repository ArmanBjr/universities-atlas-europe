import { COUNTRY_BY_CODE } from "./countries";
import type { Filters, MapPoint } from "./types";

/**
 * Filtering runs on the client against the full point set. Country policy
 * (tuition, post-study work) lives in a static module rather than the database
 * precisely so this can stay synchronous — dragging a tuition slider re-filters
 * ~15k points per frame, and a round trip would make it feel broken.
 */
export function matchesFilters(point: MapPoint, filters: Filters, needle: string): boolean {
  if (filters.countries.length && !filters.countries.includes(point.countryCode)) return false;
  if (filters.kinds.length && !filters.kinds.includes(point.kind)) return false;

  if (filters.shortlistedOnly && !point.status) return false;
  if (filters.statuses.length && (!point.status || !filters.statuses.includes(point.status))) return false;

  const country = COUNTRY_BY_CODE[point.countryCode];
  if (!country) return false;

  if (filters.euOnly && !country.eu) return false;
  if (filters.englishMasters.length && !filters.englishMasters.includes(country.englishMasters)) return false;

  // Compare against the top of each band: a country "fits the budget" only if
  // its worst realistic case is affordable, which is the honest reading.
  if (filters.maxTuitionNonEu !== null && country.tuitionNonEu.max > filters.maxTuitionNonEu) return false;
  if (filters.maxLivingCost !== null && country.livingCostPerMonth.max > filters.maxLivingCost) return false;

  if (
    filters.minPostStudyWorkMonths !== null &&
    (country.postStudyWorkMonths ?? 0) < filters.minPostStudyWorkMonths
  ) {
    return false;
  }

  if (needle && !point.name.toLowerCase().includes(needle)) return false;

  return true;
}

export function applyFilters(points: MapPoint[], filters: Filters): MapPoint[] {
  const needle = filters.query.trim().toLowerCase();
  return points.filter((p) => matchesFilters(p, filters, needle));
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.countries.length > 0 ||
    filters.kinds.length > 0 ||
    filters.englishMasters.length > 0 ||
    filters.statuses.length > 0 ||
    filters.maxTuitionNonEu !== null ||
    filters.maxLivingCost !== null ||
    filters.minPostStudyWorkMonths !== null ||
    filters.euOnly ||
    filters.shortlistedOnly
  );
}
