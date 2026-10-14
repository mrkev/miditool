// Tempo grid: maps seconds to bars and beats, and snaps times to it.

export interface Grid {
  /** Whether the grid is shown and used for snapping and export */
  enabled: boolean;
  bpm: number;
  beatsPerBar: number;
  /** Seconds at which bar 1 starts */
  offset: number;
  /** Snap subdivisions per beat, 0 for no snapping */
  snap: number;
}

export const DEFAULT_GRID: Grid = {
  enabled: false,
  bpm: 120,
  beatsPerBar: 4,
  offset: 0,
  snap: 4,
};

export const SNAP_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 1, label: "Beat" },
  { value: 2, label: "1/2 beat" },
  { value: 3, label: "1/3 beat" },
  { value: 4, label: "1/4 beat" },
  { value: 6, label: "1/6 beat" },
  { value: 8, label: "1/8 beat" },
];

export function beatDuration(grid: Grid) {
  return 60 / grid.bpm;
}

/** Seconds between snap points, or null when not snapping */
export function snapStep(grid: Grid) {
  return grid.enabled && grid.snap > 0 ? beatDuration(grid) / grid.snap : null;
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
