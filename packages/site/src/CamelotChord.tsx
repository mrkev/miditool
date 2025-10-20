export type KeyNotes = [number, number, number, number, number, number, number]; // 7 notes

export type CamelotChord =
  | "1A"
  | "2A"
  | "3A"
  | "4A"
  | "5A"
  | "6A"
  | "7A"
  | "8A"
  | "9A"
  | "10A"
  | "11A"
  | "12A"
  | "1B"
  | "2B"
  | "3B"
  | "4B"
  | "5B"
  | "6B"
  | "7B"
  | "8B"
  | "9B"
  | "10B"
  | "11B"
  | "12B";

const NOTE_OFFSETS: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10] as const;

// Map Camelot key to musical root
const CAM_TO_KEY: Record<
  CamelotChord,
  { root: string; type: "major" | "minor" }
> = {
  "1A": { root: "Ab", type: "minor" },
  "2A": { root: "Eb", type: "minor" },
  "3A": { root: "Bb", type: "minor" },
  "4A": { root: "F", type: "minor" },
  "5A": { root: "C", type: "minor" },
  "6A": { root: "G", type: "minor" },
  "7A": { root: "D", type: "minor" },
  "8A": { root: "A", type: "minor" },
  "9A": { root: "E", type: "minor" },
  "10A": { root: "B", type: "minor" },
  "11A": { root: "F#", type: "minor" },
  "12A": { root: "Db", type: "minor" },
  "1B": { root: "B", type: "major" },
  "2B": { root: "F#", type: "major" },
  "3B": { root: "Db", type: "major" },
  "4B": { root: "Ab", type: "major" },
  "5B": { root: "Eb", type: "major" },
  "6B": { root: "Bb", type: "major" },
  "7B": { root: "F", type: "major" },
  "8B": { root: "C", type: "major" },
  "9B": { root: "G", type: "major" },
  "10B": { root: "D", type: "major" },
  "11B": { root: "A", type: "major" },
  "12B": { root: "E", type: "major" },
};

// Compute map of MIDI notes
export const camelotToMidi: Record<CamelotChord, KeyNotes> = Object.fromEntries(
  Object.entries(CAM_TO_KEY).map(([camelot, { root, type }]) => {
    const rootOffset = NOTE_OFFSETS[root];
    const tonic = 60 + rootOffset - NOTE_OFFSETS["C"]; // relative to C4 (60)
    const scale = type === "major" ? MAJOR_SCALE : MINOR_SCALE;
    const notes = scale.map((interval) => tonic + interval);
    return [camelot, notes];
  })
) as Record<CamelotChord, KeyNotes>;
