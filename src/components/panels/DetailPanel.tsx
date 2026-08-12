"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { KIND_LABEL, STATUS_COLOR, STATUS_LABEL, num } from "@/lib/display";
import { prettyHost, safeUrl } from "@/lib/url";
import { APPLICATION_STATUSES, type ApplicationStatus, type UniversityDetail } from "@/lib/types";
import { CountryFacts } from "./CountryFacts";
import { NotesEditor } from "./NotesEditor";

const PRECISION_NOTE: Record<string, string | null> = {
  exact: null,
  hq: "Pin uses the registered head office.",
  city: "Pin is approximate — placed on the city, not the campus.",
};

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-dim
        transition-colors hover:border-hairline-bright hover:text-ink"
    >
      {children}
    </a>
  );
}

function StatusPicker({
  current,
  onPick,
  saving,
}: {
  current: ApplicationStatus | null;
  onPick: (status: ApplicationStatus | null) => void;
  saving: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap gap-1.5 ${saving ? "pointer-events-none opacity-60" : ""}`}
      role="group"
      aria-label="Application status"
    >
      {APPLICATION_STATUSES.map((status) => {
        const active = current === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            // Clicking the active status again clears tracking, so the same
            // control both sets and unsets without a separate "remove" button.
            onClick={() => onPick(active ? null : status)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]
              font-medium transition-all duration-150 ${
                active
                  ? "border-transparent text-void"
                  : "border-hairline bg-white/[0.02] text-ink-dim hover:border-hairline-bright hover:text-ink"
              }`}
            style={active ? { background: STATUS_COLOR[status] } : undefined}
          >
            {!active && (
              <span
                aria-hidden
                className="size-2 rounded-full ring-1 ring-black/40"
                style={{ background: STATUS_COLOR[status] }}
              />
            )}
            {STATUS_LABEL[status]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Owns nothing but the selection. The body is keyed on the id so switching
 * institutions remounts it with clean state, and closing the panel unmounts it.
 * Clearing `detail`/`error` from an effect instead would be a cascading render,
 * and it would also let the previous institution flash on screen for a frame
 * when the panel is reopened.
 */
export function DetailPanel() {
  const selectedId = useAppStore((s) => s.selectedId);
  if (!selectedId) return null;
  return <DetailPanelBody key={selectedId} universityId={selectedId} />;
}

function DetailPanelBody({ universityId }: { universityId: string }) {
  const select = useAppStore((s) => s.select);
  const applyStatus = useAppStore((s) => s.applyStatus);

  const [detail, setDetail] = useState<UniversityDetail | null>(null);
  // Always true on mount — this component only exists while an id is selected,
  // so the fetch below is unconditional.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Rollback target: the last application state the server actually confirmed.
  // `detail.application` cannot be used for this because it holds optimistic
  // values mid-flight.
  const confirmed = useRef<UniversityDetail["application"]>(null);
  // Monotonic id so a slow response from an earlier click cannot overwrite a
  // later one.
  const pickTicket = useRef(0);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/universities/${universityId}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
        const fresh = json.data as UniversityDetail;
        // A fresh load is server truth, so it also resets the rollback target
        // and invalidates any status click still in flight for the old record.
        confirmed.current = fresh.application;
        pickTicket.current++;
        setDetail(fresh);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setDetail(null);
        confirmed.current = null;
        setError(err instanceof Error ? err.message : "Could not load this institution.");
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [universityId]);

  // Esc closes the panel — the map behind it is the primary surface. The
  // listener only exists while this component is mounted, i.e. while something
  // is selected, so no guard is needed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const handlePick = useCallback(
    async (status: ApplicationStatus | null) => {
      if (!detail) return;

      // Clicking two statuses quickly used to corrupt the rollback: the second
      // click captured the first click's *optimistic* value as "previous", so a
      // failure rolled back to a state that was never confirmed by the server.
      // The last click wins, and only the last click may write state.
      const ticket = ++pickTicket.current;
      const isCurrent = () => pickTicket.current === ticket;

      const previous = confirmed.current;
      setSaving(true);

      // Optimistic: the chip lights up and the marker recolours before the
      // round-trip finishes. Tracking a fresh institution has no row to spread,
      // so a provisional one stands in until the server returns the real ids.
      const optimistic =
        status === null
          ? null
          : {
              id: previous?.id ?? -1,
              universityId: detail.id,
              status,
              priority: previous?.priority ?? 0,
              notes: previous?.notes ?? null,
              deadline: previous?.deadline ?? null,
              createdAt: previous?.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
      setDetail({ ...detail, application: optimistic });
      applyStatus(detail.id, status);

      try {
        const res = await fetch("/api/applications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ universityId: detail.id, status }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!isCurrent()) return; // a later click already owns the state
        confirmed.current = json.data;
        setDetail((d) => (d && d.id === detail.id ? { ...d, application: json.data } : d));
        setError(null);
      } catch (err) {
        if (!isCurrent()) return;
        // Roll back both the panel and the map so the dot never lies.
        setDetail((d) => (d && d.id === detail.id ? { ...d, application: previous } : d));
        applyStatus(detail.id, previous?.status ?? null);
        setError(err instanceof Error ? err.message : "Could not save that status.");
      } finally {
        if (isCurrent()) setSaving(false);
      }
    },
    [detail, applyStatus],
  );

  const website = safeUrl(detail?.website);
  const wikipedia = safeUrl(detail?.wikipediaUrl);
  const precisionNote = detail ? PRECISION_NOTE[detail.coordPrecision] : null;

  return (
    <aside
      aria-label="Institution detail"
      className="panel scroll-thin pointer-events-auto flex max-h-full w-[22rem] flex-col overflow-y-auto
        overscroll-contain rounded-xl border border-hairline"
    >
      <header className="sticky top-0 z-10 border-b border-hairline bg-abyss/80 px-4 pb-3 pt-3.5 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {loading && !detail ? (
              <div className="h-5 w-48 animate-pulse rounded bg-white/10" />
            ) : (
              <h2 className="font-display text-lg leading-tight text-ink">
                {detail?.name ?? "Not available"}
              </h2>
            )}
            {detail?.nativeName && detail.nativeName !== detail.name && (
              <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{detail.nativeName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => select(null)}
            aria-label="Close detail panel"
            className="-mr-1 -mt-1 shrink-0 rounded-md px-2 py-1 text-[15px] leading-none text-ink-faint
              transition-colors hover:text-ink"
          >
            ×
          </button>
        </div>

        {detail && (
          <p className="mt-1.5 text-[11px] text-ink-dim">
            {[detail.city, detail.country.name].filter(Boolean).join(", ")}
            <span className="text-ink-faint"> · {KIND_LABEL[detail.kind]}</span>
          </p>
        )}
      </header>

      {error && (
        <p role="alert" className="border-b border-hairline px-4 py-2.5 text-[11px] text-st-rejected">
          {error}
        </p>
      )}

      {detail && (
        <>
          <section className="border-b border-hairline px-4 py-3.5">
            <h3 className="eyebrow mb-2.5">Track this application</h3>
            <StatusPicker
              current={detail.application?.status ?? null}
              onPick={handlePick}
              saving={saving}
            />
            {!detail.application && (
              <p className="mt-2 text-[10.5px] text-ink-faint">
                Pick a status to add this to your shortlist.
              </p>
            )}
          </section>

          {detail.application && (
            <section className="border-b border-hairline px-4 py-3.5">
              {/* No key needed: the whole body is already keyed on the
                  selection, so switching institutions remounts the editor with
                  the new notes rather than carrying the previous draft over. */}
              <NotesEditor
                universityId={detail.id}
                initialNotes={detail.application.notes ?? ""}
              />
            </section>
          )}

          <section className="border-b border-hairline px-4 py-3.5">
            <h3 className="eyebrow mb-2.5">Immigration &amp; cost</h3>
            <CountryFacts country={detail.country} />
          </section>

          <section className="px-4 pb-4 pt-3.5">
            <h3 className="eyebrow mb-2.5">Institution</h3>
            <dl className="space-y-1.5 text-[11.5px]">
              {detail.founded !== null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-faint">Founded</dt>
                  <dd className="tabular text-ink-dim">{detail.founded}</dd>
                </div>
              )}
              {detail.students !== null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-faint">Students</dt>
                  <dd className="tabular text-ink-dim">{num.format(detail.students)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-ink-faint">Coordinates</dt>
                <dd className="tabular text-ink-dim">
                  {detail.lat.toFixed(3)}, {detail.lng.toFixed(3)}
                </dd>
              </div>
            </dl>

            {(website || wikipedia) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {website && <ExternalLink href={website}>{prettyHost(website)}</ExternalLink>}
                {wikipedia && <ExternalLink href={wikipedia}>Wikipedia</ExternalLink>}
              </div>
            )}

            {precisionNote && (
              <p className="mt-3 text-[10px] leading-snug text-ink-faint">{precisionNote}</p>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
