import { DEFAULT_VELOCITY, type Note } from "./notes";
import { midiToFrequency } from "./spectrogram";

/** Synth level at full volume, roughly matching typical recordings */
const NOTES_GAIN = 0.3;

/**
 * Plays the loaded audio, along with a simple synth voice for each note so
 * the transcription can be compared against the recording.
 */
export class Player {
  readonly ctx = new AudioContext();
  private readonly audioGain = this.ctx.createGain();
  private readonly notesGain = this.ctx.createGain();
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private voices: OscillatorNode[] = [];
  private notes: Note[] = [];
  /** ctx.currentTime when playback position 0 would have started */
  private startedAt = 0;
  /** Position when paused */
  private position = 0;
  private listeners = new Set<() => void>();

  playing = false;

  constructor() {
    this.audioGain.connect(this.ctx.destination);
    this.notesGain.connect(this.ctx.destination);
    this.notesGain.gain.value = NOTES_GAIN;
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  get currentTime() {
    if (!this.playing) {
      return this.position;
    }
    return Math.min(this.ctx.currentTime - this.startedAt, this.duration);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  load(buffer: AudioBuffer | null) {
    this.pause();
    this.buffer = buffer;
    this.position = 0;
    this.emit();
  }

  setAudioVolume(volume: number) {
    this.audioGain.gain.value = volume;
  }

  setNotesVolume(volume: number) {
    this.notesGain.gain.value = volume * NOTES_GAIN;
  }

  setNotes(notes: Note[]) {
    this.notes = notes;
    if (this.playing) {
      this.stopVoices();
      this.scheduleVoices();
    }
  }

  play() {
    if (this.buffer == null || this.playing) {
      return;
    }
    void this.ctx.resume();
    const from = this.position >= this.duration ? 0 : this.position;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.audioGain);
    source.onended = () => {
      // Only handle reaching the end, not stop() from pause/seek
      if (this.source === source) {
        this.source = null;
        this.playing = false;
        this.position = this.duration;
        this.stopVoices();
        this.emit();
      }
    };
    source.start(0, from);
    this.source = source;
    this.startedAt = this.ctx.currentTime - from;
    this.playing = true;
    this.scheduleVoices();
    this.emit();
  }

  pause() {
    if (!this.playing) {
      return;
    }
    this.position = this.currentTime;
    this.playing = false;
    const source = this.source;
    this.source = null;
    source?.stop();
    this.stopVoices();
    this.emit();
  }

  /** Starts playing from `time`, whether or not already playing */
  playFrom(time: number) {
    this.pause();
    this.position = Math.max(0, Math.min(time, this.duration));
    this.play();
  }

  seek(time: number) {
    const wasPlaying = this.playing;
    this.pause();
    this.position = Math.max(0, Math.min(time, this.duration));
    if (wasPlaying) {
      this.play();
    } else {
      this.emit();
    }
  }

  /** Plays a short preview of a pitch */
  preview(pitch: number, duration = 0.3, velocity = DEFAULT_VELOCITY) {
    void this.ctx.resume();
    const now = this.ctx.currentTime;
    this.voice(pitch, velocity, now, now + duration);
  }

  private voice(pitch: number, velocity: number, start: number, end: number) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    // Roughly how velocity maps to loudness on most instruments
    const peak = Math.pow(velocity / 127, 1.5);
    osc.type = "triangle";
    osc.frequency.value = midiToFrequency(pitch);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.005);
    env.gain.setValueAtTime(peak, Math.max(start + 0.005, end - 0.03));
    env.gain.linearRampToValueAtTime(0, end);
    osc.connect(env).connect(this.notesGain);
    osc.start(start);
    osc.stop(end);
    return osc;
  }

  private scheduleVoices() {
    const now = this.currentTime;
    for (const note of this.notes) {
      const end = note.start + note.duration;
      if (end <= now) {
        continue;
      }
      const start = Math.max(note.start, now);
      const osc = this.voice(
        note.pitch,
        note.velocity,
        this.startedAt + start,
        this.startedAt + end,
      );
      this.voices.push(osc);
    }
  }

  private stopVoices() {
    for (const osc of this.voices) {
      osc.onended = null;
      try {
        osc.stop();
      } catch {
        // Not started yet
      }
      osc.disconnect();
    }
    this.voices = [];
  }

  dispose() {
    this.pause();
    void this.ctx.close();
  }
}
