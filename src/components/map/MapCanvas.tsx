"use client";

import { useEffect, useRef } from "react";
// MapLibre 6 ships named exports only — there is no default export to import.
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapGeoJSONFeature, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useAppStore } from "@/lib/store";
import { STATUS_COLOR, UNTRACKED_COLOR } from "@/lib/display";
import type { MapPoint } from "@/lib/types";

/**
 * MapLibre normally locates its worker bundle from `import.meta.url`, which
 * Turbopack does not give it as an http(s) URL — so it falls back to
 * `new Worker("")`, loads this HTML page as an ES module, and the worker dies
 * without an error event. Everything parsed in the worker (i.e. every GeoJSON
 * layer) then renders nothing at all, while the raster basemap carries on
 * looking fine. `scripts/copy-maplibre-worker.mjs` puts the bundle here.
 */
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/**
 * CARTO's free dark basemap. The vector GL style
 * (`dark-matter-gl-style/style.json`) hangs forever in MapLibre 6 here —
 * `isStyleLoaded()` never flips and no `.mvt` requests leave the browser —
 * so we use the raster tiles instead. Same look, no API key.
 *
 * Glyphs are required for cluster count labels (symbol layers); the raster
 * style has none of its own, so we point at MapLibre's free demotiles fonts.
 * Only some stacks exist there: "Open Sans Semibold" and "Noto Sans Regular"
 * serve, while "Open Sans Bold" and even "Open Sans Regular" 404. Check any new
 * font name against the endpoint before using it — a missing stack means no
 * cluster counts.
 */
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: "CARTO Dark Matter",
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© CARTO © OpenStreetMap contributors",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const SRC = "universities";
const LAYER_CLUSTER = "clusters";
const LAYER_CLUSTER_COUNT = "cluster-count";
const LAYER_POINT = "points";
const LAYER_SELECTED = "selected-point";

function toGeoJSON(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      // Only what the paint expressions and click handler read — feature
      // properties are copied per point, so this stays lean.
      properties: { id: p.id, name: p.name, status: p.status ?? "" },
    })),
  };
}

/**
 * Builds a MapLibre `match` expression mapping status -> colour, falling back to
 * the neutral tone for untracked institutions.
 */
function statusColorExpression(): maplibregl.ExpressionSpecification {
  const pairs = Object.entries(STATUS_COLOR).flatMap(([status, color]) => [status, color]);
  // `ExpressionSpecification` encodes `match`'s minimum arity in its tuple type,
  // which a spread can never satisfy statically. The runtime shape is correct:
  // ["match", input, label, value, …, fallback].
  return ["match", ["get", "status"], ...pairs, UNTRACKED_COLOR] as unknown as maplibregl.ExpressionSpecification;
}

/**
 * `visible` is the already-filtered set. Filtering lives in the parent so the
 * map and the panel counters can never disagree about what is on screen.
 */
export function MapCanvas({ visible }: { visible: MapPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const ready = useRef(false);
  // The `load` handler fires long after the creation effect, so it reads the
  // latest data through a ref rather than closing over the first render's copy.
  const latest = useRef<MapPoint[]>(visible);

  const selectedId = useAppStore((s) => s.selectedId);
  const select = useAppStore((s) => s.select);

  // The click handler is registered once but must always call the current
  // `select`. Reading it through a ref keeps it out of the creation effect's
  // dependencies — if `select` ever changed identity, listing it there would
  // tear the whole map down and rebuild it mid-session.
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  }, [select]);

  // Map instance is created once; data and paint are driven by later effects.
  useEffect(() => {
    if (!container.current || map.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [10, 50],
      zoom: 3.4,
      minZoom: 1.4,
      maxZoom: 16,
      attributionControl: { compact: true },
    });

    map.current = m;

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    popup.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      maxWidth: "260px",
    });

    m.on("load", () => {
      // Globe makes the "all of Europe at once" view feel like a place rather
      // than a rectangle, and degrades to mercator on unsupported hardware.
      try {
        m.setProjection({ type: "globe" });
      } catch {
        /* older GPUs fall back to mercator automatically */
      }

      m.addSource(SRC, {
        type: "geojson",
        // Seed with whatever has already arrived — if the /api/universities
        // response beat the style load, an empty FeatureCollection here plus
        // a skipped setData (ready was still false) would leave the map blank
        // forever, because `visible` would not change again to retrigger it.
        data: toGeoJSON(latest.current),
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 11,
      });

      m.addLayer({
        id: LAYER_CLUSTER,
        type: "circle",
        source: SRC,
        filter: ["has", "point_count"],
        paint: {
          // Amber ramp: bigger, hotter clusters read as denser regions.
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "point_count"],
            2, "#3d4f6b",
            15, "#5b6f8f",
            60, "#a88a45",
            200, "#d9a23f",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "point_count"],
            2, 13,
            15, 18,
            60, 25,
            200, 34,
          ],
          "circle-opacity": 0.88,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#0b0d14",
        },
      });

      m.addLayer({
        id: LAYER_CLUSTER_COUNT,
        type: "symbol",
        source: SRC,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Semibold"],
          "text-size": 12,
        },
        paint: { "text-color": "#0b0d14" },
      });

      m.addLayer({
        id: LAYER_POINT,
        type: "circle",
        source: SRC,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": statusColorExpression(),
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4, 3.4,
            8, 5.5,
            13, 8,
          ],
          // Tracked institutions get a visible ring so they stand out at a glance.
          "circle-stroke-width": ["case", ["==", ["get", "status"], ""], 0.8, 2],
          "circle-stroke-color": ["case", ["==", ["get", "status"], ""], "#0b0d14", "#f2f4f8"],
          "circle-opacity": 0.95,
        },
      });

      m.addLayer({
        id: LAYER_SELECTED,
        type: "circle",
        source: SRC,
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-radius": 13,
          "circle-color": "transparent",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#63c7dd",
        },
      });

      ready.current = true;
      const src = m.getSource(SRC) as GeoJSONSource | undefined;
      src?.setData(toGeoJSON(latest.current));
    });

    const showPopup = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!f || !popup.current) return;
      m.getCanvas().style.cursor = "pointer";
      popup.current
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setText(String(f.properties?.name ?? ""))
        .addTo(m);
    };

    const hidePopup = () => {
      m.getCanvas().style.cursor = "";
      popup.current?.remove();
    };

    m.on("mouseenter", LAYER_POINT, showPopup);
    m.on("mousemove", LAYER_POINT, showPopup);
    m.on("mouseleave", LAYER_POINT, hidePopup);

    m.on("click", LAYER_POINT, (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const id = f?.properties?.id;
      if (typeof id === "string") selectRef.current(id);
    });

    // Clicking a cluster drills into it rather than doing nothing.
    m.on("click", LAYER_CLUSTER, async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const clusterId = f?.properties?.cluster_id;
      if (clusterId === undefined) return;
      const src = m.getSource(SRC) as GeoJSONSource;
      try {
        const zoom = await src.getClusterExpansionZoom(clusterId as number);
        m.easeTo({
          center: (f!.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: Math.min(zoom + 0.4, 15),
          duration: 600,
        });
      } catch {
        /* cluster vanished between click and resolve — nothing to do */
      }
    });

    m.on("mouseenter", LAYER_CLUSTER, () => {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", LAYER_CLUSTER, () => {
      m.getCanvas().style.cursor = "";
    });

    return () => {
      popup.current?.remove();
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  // Push the filtered set into the existing source instead of rebuilding layers.
  useEffect(() => {
    latest.current = visible;
    const m = map.current;
    if (!m || !ready.current) return;
    const src = m.getSource(SRC) as GeoJSONSource | undefined;
    src?.setData(toGeoJSON(visible));
  }, [visible]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !m.getLayer(LAYER_SELECTED)) return;
    m.setFilter(LAYER_SELECTED, ["==", ["get", "id"], selectedId ?? "__none__"]);
  }, [selectedId]);

  // MapLibre stamps `position: relative` on the container (see maplibre-gl.css),
  // which overrides Tailwind `absolute` and collapses `inset-0` to height 0.
  // Outer shell owns the absolute fill; the inner node is what MapLibre mounts
  // into and only needs `h-full w-full`.
  //
  // `role="application"` tells screen readers to pass arrow keys through to the
  // map's own pan/zoom handling rather than intercepting them for browse mode.
  return (
    <div className="absolute inset-0">
      <div
        ref={container}
        role="application"
        aria-label="Map of European universities"
        className="h-full w-full"
      />
    </div>
  );
}
