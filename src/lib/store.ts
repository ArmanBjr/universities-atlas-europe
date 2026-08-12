"use client";

import { create } from "zustand";
import { DEFAULT_FILTERS, type ApplicationStatus, type Filters, type MapPoint } from "./types";

interface AppState {
  points: MapPoint[];
  loading: boolean;
  loadError: string | null;

  filters: Filters;
  selectedId: string | null;
  panelOpen: boolean;

  loadPoints: () => Promise<void>;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  toggleInArray: <K extends "countries" | "kinds" | "englishMasters" | "statuses">(
    key: K,
    value: Filters[K][number],
  ) => void;
  resetFilters: () => void;
  select: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  /** Mirrors a saved status onto the in-memory points so markers recolour. */
  applyStatus: (universityId: string, status: ApplicationStatus | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  points: [],
  loading: true,
  loadError: null,

  filters: DEFAULT_FILTERS,
  selectedId: null,
  panelOpen: true,

  loadPoints: async () => {
    set({ loading: true, loadError: null });
    try {
      const res = await fetch("/api/universities");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
      set({ points: json.data as MapPoint[], loading: false });
    } catch (err) {
      set({
        loading: false,
        loadError: err instanceof Error ? err.message : "Could not reach the server.",
      });
    }
  },

  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),

  toggleInArray: (key, value) =>
    set((s) => {
      const current = s.filters[key] as readonly string[];
      const next = current.includes(value as string)
        ? current.filter((v) => v !== value)
        : [...current, value as string];
      return { filters: { ...s.filters, [key]: next } as Filters };
    }),

  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  select: (id) => set({ selectedId: id }),

  setPanelOpen: (open) => set({ panelOpen: open }),

  applyStatus: (universityId, status) =>
    set({
      points: get().points.map((p) => (p.id === universityId ? { ...p, status } : p)),
    }),
}));
