"use client";

import { useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { applyFilters } from "@/lib/filter";
import { MapCanvas } from "./map/MapCanvas";
import { FilterPanel } from "./panels/FilterPanel";
import { DetailPanel } from "./panels/DetailPanel";

/** Full-bleed status message centred over the map. */
function Overlay({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
      <p
        role={tone === "error" ? "alert" : "status"}
        className={`panel pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-center text-[12.5px] leading-relaxed ${
          tone === "error" ? "text-st-rejected" : "text-ink-dim"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

export function Shell() {
  const loadPoints = useAppStore((s) => s.loadPoints);
  const points = useAppStore((s) => s.points);
  const filters = useAppStore((s) => s.filters);
  const loading = useAppStore((s) => s.loading);
  const loadError = useAppStore((s) => s.loadError);
  const panelOpen = useAppStore((s) => s.panelOpen);
  const setPanelOpen = useAppStore((s) => s.setPanelOpen);

  useEffect(() => {
    void loadPoints();
  }, [loadPoints]);

  // Single source of truth for "what is on screen" — the map and the counters
  // both read this, so they cannot drift apart.
  const visible = useMemo(() => applyFilters(points, filters), [points, filters]);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <MapCanvas visible={visible} />

      {loading && points.length === 0 && <Overlay>Loading institutions…</Overlay>}
      {loadError && (
        <Overlay tone="error">
          {loadError}
          <br />
          <span className="text-ink-faint">
            Run <code className="font-mono">npm run db:seed</code> if the database is empty.
          </span>
        </Overlay>
      )}

      {/* Chrome floats over the map; only the panels themselves take pointer events. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-stretch justify-between gap-3 p-3">
        <div
          id="filter-panel"
          className={`panel pointer-events-auto w-[19.5rem] max-w-[calc(100vw-1.5rem)] shrink-0
            overflow-hidden rounded-xl md:flex ${panelOpen ? "flex" : "hidden"}`}
        >
          <FilterPanel visibleCount={visible.length} />
        </div>

        <DetailPanel />
      </div>

      {/* Small screens cannot afford a permanent sidebar, so it becomes a drawer. */}
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        aria-expanded={panelOpen}
        aria-controls="filter-panel"
        className="panel absolute bottom-3 left-3 z-20 rounded-lg px-3 py-2 text-[12px] font-medium
          text-ink-dim transition-colors hover:text-ink md:hidden"
      >
        {panelOpen ? "Hide filters" : "Filters"}
      </button>
    </main>
  );
}
