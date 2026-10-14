import { writeMidi, type MidiEvent } from "midi-file";

export interface Note {
  id: number;
  /** MIDI note number */
  pitch: number;
  /** Seconds */
  start: number;
  /** Seconds */
  duration: number;
}

let nextId = 1;
export function createNote(fields: Omit<Note, "id">): Note {
  return { id: nextId++, ...fields };
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function noteName(pitch: number) {
  return `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function isBlackKey(pitch: number) {
  return [1, 3, 6, 8, 10].includes(pitch % 12);
}

const TICKS_PER_BEAT = 480;
const BPM = 120;
const TICKS_PER_SECOND = (TICKS_PER_BEAT * BPM) / 60;

/** Encodes notes as a single-track MIDI file at 120 BPM */
export function notesToMidi(notes: Note[]): Uint8Array {
  const events = notes
    .flatMap((note) => [
      { tick: Math.round(note.start * TICKS_PER_SECOND), on: true, note },
      {
        tick: Math.round((note.start + note.duration) * TICKS_PER_SECOND),
        on: false,
        note,
      },
    ])
    // Note-offs first, so back-to-back notes of the same pitch don't cut
    // each other off
    .sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));

  const track: MidiEvent[] = [
    {
      deltaTime: 0,
      meta: true,
      type: "setTempo",
      microsecondsPerBeat: 60_000_000 / BPM,
    },
  ];
  let lastTick = 0;
  for (const { tick, on, note } of events) {
    track.push({
      deltaTime: tick - lastTick,
      channel: 0,
      type: on ? "noteOn" : "noteOff",
      noteNumber: note.pitch,
      velocity: on ? 100 : 0,
    });
    lastTick = tick;
  }
  track.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

  return new Uint8Array(
    writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: TICKS_PER_BEAT },
      tracks: [track],
    }),
  );
}
