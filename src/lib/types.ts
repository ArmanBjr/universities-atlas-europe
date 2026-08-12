/**
 * Provenance matters here: the three tiers below have very different
 * trust levels, and mixing them silently would make the whole dataset unciteable.
 *  - `wikidata`  : machine-imported, re-fetchable, may be incomplete
 *  - `curated`   : hand-verified against official sources, has a review date
 *  - `user`      : entered by you, never overwritten by an import
 */
export type DataSource = "wikidata" | "curated" | "user";

export type InstitutionKind =
  | "university"
  | "applied_sciences"
  | "technical"
  | "art_music"
  | "business"
  | "medical"
  | "other";

/** `exact` = the institution's own coordinates; the others are fallbacks. */
export type CoordPrecision = "exact" | "hq" | "city";

export interface University {
  id: string;
  slug: string;
  name: string;
  nativeName: string | null;
  city: string | null;
  countryCode: string;
  lat: number;
  lng: number;
  /**
   * How the position was derived. Most Wikidata entries have no coordinates of
   * their own, so `hq` and `city` values are approximations good enough to place
   * a marker in the right town but not on the right building.
   */
  coordPrecision: CoordPrecision;
  kind: InstitutionKind;
  website: string | null;
  founded: number | null;
  students: number | null;
  wikidataId: string | null;
  wikipediaUrl: string | null;
  source: DataSource;
}

/** Fee and immigration facts are national policy, so they live at country level. */
export interface Range {
  min: number;
  max: number;
}

export type EnglishAvailability = "extensive" | "moderate" | "limited";

export interface CountryProfile {
  code: string;
  name: string;
  flag: string;
  eu: boolean;
  schengen: boolean;
  currency: string;
  languages: string[];
  /** Annual public-university tuition in EUR for EU/EEA nationals. */
  tuitionEu: Range;
  /** Annual public-university tuition in EUR for non-EU nationals. */
  tuitionNonEu: Range;
  /** Mandatory per-semester administrative fee in EUR, where tuition is free. */
  semesterFee: Range | null;
  livingCostPerMonth: Range;
  /** Funds you must prove for a student visa, EUR per year. */
  proofOfFundsPerYear: number | null;
  healthInsurancePerMonth: number | null;
  englishMasters: EnglishAvailability;
  /** Months you may stay to look for work after graduating. */
  postStudyWorkMonths: number | null;
  workHoursPerWeek: number | null;
  /** Years of legal residence before permanent residence is possible. */
  permanentResidenceYears: number | null;
  studentVisaName: string | null;
  notes: string;
  /** ISO date of the last manual verification pass against official sources. */
  lastReviewed: string;
}

export type ApplicationStatus =
  | "interested"
  | "shortlisted"
  | "preparing"
  | "applied"
  | "interview"
  | "admitted"
  | "rejected"
  | "enrolled"
  | "declined";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "interested",
  "shortlisted",
  "preparing",
  "applied",
  "interview",
  "admitted",
  "rejected",
  "enrolled",
  "declined",
];

export interface Application {
  id: number;
  universityId: string;
  status: ApplicationStatus;
  priority: number;
  notes: string | null;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Degree = "bachelor" | "master" | "phd";

export interface Program {
  id: number;
  universityId: string;
  name: string;
  degree: Degree;
  language: string;
  tuitionPerYear: number | null;
  durationMonths: number | null;
  deadline: string | null;
  url: string | null;
  requirements: string | null;
  createdAt: string;
}

/**
 * Trimmed projection sent to the map. Every extra field here is multiplied by
 * the full institution count, so it stays deliberately minimal.
 */
export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  countryCode: string;
  kind: InstitutionKind;
  status: ApplicationStatus | null;
}

/** A university joined with its country's policy facts and your own status. */
export interface UniversityDetail extends University {
  country: CountryProfile;
  application: Application | null;
  programs: Program[];
}

export interface Filters {
  query: string;
  countries: string[];
  kinds: InstitutionKind[];
  englishMasters: EnglishAvailability[];
  maxTuitionNonEu: number | null;
  maxLivingCost: number | null;
  minPostStudyWorkMonths: number | null;
  euOnly: boolean;
  statuses: ApplicationStatus[];
  shortlistedOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  query: "",
  countries: [],
  kinds: [],
  englishMasters: [],
  maxTuitionNonEu: null,
  maxLivingCost: null,
  minPostStudyWorkMonths: null,
  euOnly: false,
  statuses: [],
  shortlistedOnly: false,
};
