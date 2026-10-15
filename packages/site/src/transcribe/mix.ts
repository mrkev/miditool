// Playback balance between the recording, the synth playing the notes and
// the metronome

export type Channel = "audio" | "notes" | "metronome";

export interface Mix {
  /** Channels that are on */
  enabled: Channel[];
  /** Slider levels, 0 to 1 */
  levels: Record<Channel, number>;
}

export const DEFAULT_MIX: Mix = {
  enabled: ["audio", "notes"],
  levels: { audio: 1, notes: 0.7, metronome: 0.7 },
};

/** Squared, so the slider feels closer to linear in loudness */
export function levelToGain(level: number) {
  return level * level;
}

const STORAGE_KEY = "miditool:transcribe:mix";

/** The mix last used in this browser */
export function loadMix(): Mix {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved?.levels && Array.isArray(saved.enabled)) {
      return {
        enabled: saved.enabled,
        levels: { ...DEFAULT_MIX.levels, ...saved.levels },
      };
    }
  } catch {
    // Fall back to the default
  }
  return DEFAULT_MIX;
}

export function saveMix(mix: Mix) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mix));
  } catch {
    // Remembering the mix is a convenience
  }
}
