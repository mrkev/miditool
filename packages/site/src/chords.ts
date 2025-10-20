import { KeyNotes } from "./CamelotChord";

export function getMajorTriad(keyNotes: KeyNotes): [number, number, number] {
  const [root, , third, , fifth] = keyNotes; // 1st, 3rd, 5th degrees
  return [root, third, fifth];
}
