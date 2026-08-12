"use client";

import { useEffect, useRef, useState } from "react";

const SAVE_DEBOUNCE_MS = 700;
const MAX_NOTES = 4000;

type SaveState = "idle" | "saving" | "saved" | "error";

interface NotesEditorProps {
  universityId: string;
  initialNotes: string;
}

/**
 * Autosaves rather than offering a Save button — notes here are scratch thinking
 * ("ask about the January intake"), and losing them to a forgotten click would
 * be worse than the occasional redundant request.
 */
export function NotesEditor({ universityId, initialNotes }: NotesEditorProps) {
  // Switching universities must not carry the previous one's draft over. That
  // reset comes from DetailPanel remounting its keyed body, not from an effect:
  // an effect watching `initialNotes` would also fire when a save round-trip
  // echoes the saved text back, wiping out anything typed in the meantime.
  const [text, setText] = useState(initialNotes);
  const [state, setState] = useState<SaveState>("idle");

  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
      inFlight.current?.abort();
    },
    [],
  );

  const scheduleSave = (value: string) => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setState("saving");
      try {
        const res = await fetch("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ universityId, notes: value }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
        setState("saved");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      }
    }, SAVE_DEBOUNCE_MS);
  };

  const handleChange = (value: string) => {
    setText(value);
    scheduleSave(value);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor="notes" className="eyebrow">
          Notes
        </label>
        <span
          className={`text-[10px] ${state === "error" ? "text-st-rejected" : "text-ink-faint"}`}
          role={state === "error" ? "alert" : undefined}
        >
          {state === "saving" && "Saving…"}
          {state === "saved" && "Saved"}
          {state === "error" && "Not saved — retry by typing"}
        </span>
      </div>
      <textarea
        id="notes"
        value={text}
        maxLength={MAX_NOTES}
        rows={4}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Deadlines, contacts, why this one is on the list…"
        className="scroll-thin w-full resize-y rounded-lg border border-hairline bg-black/30 px-3 py-2
          text-[12.5px] leading-relaxed text-ink placeholder:text-ink-faint
          focus:border-signal/60 focus:bg-black/40"
      />
    </div>
  );
}
