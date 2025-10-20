export function noteon(note: number, velocity?: number) {
  return [0x90, note, velocity ?? 127] as const;
}
export function noteoff(note: number) {
  return [0x80, note, 0] as const;
}
