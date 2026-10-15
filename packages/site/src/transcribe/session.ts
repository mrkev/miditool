import { normalizeGrid, type Grid } from "./grid";
import type { NoteInput } from "./notes";

// Autosaved transcription for each audio file, in localStorage

const PREFIX = "miditool:transcribe:";

export interface Session {
  notes: NoteInput[];
  grid: Grid;
}

/** Identifies an audio file across page loads */
export function sessionKey(file: File) {
  return `${PREFIX}${file.name}:${file.size}`;
}

export function loadSession(key: string): Session | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return {
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      grid: normalizeGrid(parsed.grid),
    };
  } catch {
    return null;
  }
}

export function saveSession(key: string, session: Session) {
  try {
    if (session.notes.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(
        key,
        JSON.stringify({
          notes: session.notes.map(
            ({ pitch, start, duration, velocity, muted }) => ({
              pitch,
              start,
              duration,
              velocity,
              muted,
            }),
          ),
          grid: session.grid,
        }),
      );
    }
  } catch {
    // Storage full or unavailable; autosave is best-effort
  }
}
