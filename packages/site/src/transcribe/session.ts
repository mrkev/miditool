import { DEFAULT_GRID, type Grid } from "./grid";
import type { Note } from "./notes";

// Autosaved transcription for each audio file, in localStorage

const PREFIX = "miditool:transcribe:";

export interface Session {
  notes: Omit<Note, "id">[];
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
      grid: { ...DEFAULT_GRID, ...parsed.grid },
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
          notes: session.notes.map(({ pitch, start, duration }) => ({
            pitch,
            start,
            duration,
          })),
          grid: session.grid,
        }),
      );
    }
  } catch {
    // Storage full or unavailable; autosave is best-effort
  }
}
