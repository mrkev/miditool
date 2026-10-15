// Tempo grid: maps seconds to bars and beats, and snaps times to it.

/** Snap resolution as a note value, Ableton style. A beat is a quarter note */
export type Snap = "off" | "bar" | "1/2" | "1/4" | "1/8" | "1/16" | "1/32";

export interface Grid {
  /** Whether the grid is shown and used for snapping and export */
  enabled: boolean;
  bpm: number;
  beatsPerBar: number;
  /** Seconds at which bar 1 starts */
  offset: number;
  snap: Snap;
  /** Triplet grid: each division is 2/3 as long */
  triplet: boolean;
}

export const DEFAULT_GRID: Grid = {
  enabled: false,
  bpm: 120,
  beatsPerBar: 4,
  offset: 0,
  snap: "1/16",
  triplet: false,
};

export const SNAP_OPTIONS: { value: Snap; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "bar", label: "1 bar" },
  { value: "1/2", label: "1/2" },
  { value: "1/4", label: "1/4" },
  { value: "1/8", label: "1/8" },
  { value: "1/16", label: "1/16" },
  { value: "1/32", label: "1/32" },
];

/** Grid saved by older versions, which stored snap as subdivisions per beat */
const LEGACY_SNAP: Record<number, Pick<Grid, "snap" | "triplet">> = {
  0: { snap: "off", triplet: false },
  1: { snap: "1/4", triplet: false },
  2: { snap: "1/8", triplet: false },
  3: { snap: "1/8", triplet: true },
  4: { snap: "1/16", triplet: false },
  6: { snap: "1/16", triplet: true },
  8: { snap: "1/32", triplet: false },
};

/** Fills in defaults and migrates older saved grids */
export function normalizeGrid(saved: unknown): Grid {
  const grid = { ...DEFAULT_GRID, ...(saved as Partial<Grid>) };
  const snap: unknown = grid.snap;
  if (typeof snap === "number") {
    return { ...grid, ...(LEGACY_SNAP[snap] ?? LEGACY_SNAP[4]) };
  }
  if (!SNAP_OPTIONS.some((option) => option.value === snap)) {
    return { ...grid, snap: DEFAULT_GRID.snap };
  }
  return grid;
}

/**
 * Length of a grid division in beats, for a snap value. Defaults to 1/16
 * for drawing when snapping is off.
 */
export function divisionBeats(grid: Grid, snap: Snap = grid.snap) {
  const straight =
    snap === "off"
      ? 0.25
      : snap === "bar"
        ? grid.beatsPerBar
        : 4 / Number(snap.slice(2));
  return grid.triplet ? (straight * 2) / 3 : straight;
}

export function beatDuration(grid: Grid) {
  return 60 / grid.bpm;
}

/** Seconds between snap points, or null when not snapping */
export function snapStep(grid: Grid) {
  return grid.enabled && grid.snap !== "off"
    ? divisionBeats(grid) * beatDuration(grid)
    : null;
}

export function snapTime(grid: Grid, time: number) {
  const step = snapStep(grid);
  if (step == null) {
    return time;
  }
  return grid.offset + Math.round((time - grid.offset) / step) * step;
}

/** Beat number (0-based, fractional) at a time; negative before bar 1 */
export function timeToBeat(grid: Grid, time: number) {
  return (time - grid.offset) / beatDuration(grid);
}

export function beatToTime(grid: Grid, beat: number) {
  return grid.offset + beat * beatDuration(grid);
}

/** Estimates BPM from tap timestamps (ms), using the median interval */
export function tapTempo(taps: number[]): number | null {
  if (taps.length < 2) {
    return null;
  }
  const intervals = taps
    .slice(1)
    .map((t, i) => t - taps[i])
    .sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  return Math.round((60000 / median) * 10) / 10;
}
