import { MinusIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type CamelotChord, camelotToMidi } from "./CamelotChord";
import CamelotWheel, { type Notation } from "./CamelotWheel";
import { getMajorTriad } from "./chords";
import { MidiOutputSelector } from "./MidiOutputSelector";
import PianoKeys from "./PianoKeys";
import { noteoff, noteon } from "./utils/midi";

const MIN_OCTAVE = -4;
const MAX_OCTAVE = 4;

export function App() {
  const [output, setOutput] = useState<MIDIOutput | null>(null);
  const [octave, setOctave] = useState(0);
  const [notation, setNotation] = useState<Notation>("camelot");
  const [highlighted, setHighlighted] = useState<number[]>([]);
  // Notes currently held by the wheel, so note-offs match the note-ons even
  // if the octave changes mid-chord
  const chordNotesRef = useRef<number[]>([]);

  const sendChordDown = (chord: CamelotChord) => {
    const notes = getMajorTriad(camelotToMidi[chord]).map(
      (note) => note + octave * 12
    );
    chordNotesRef.current = notes;
    setHighlighted(notes);
    for (const note of notes) {
      output?.send(noteon(note));
    }
  };

  const sendChordUp = () => {
    for (const note of chordNotesRef.current) {
      output?.send(noteoff(note));
    }
    chordNotesRef.current = [];
    setHighlighted([]);
  };

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-base font-semibold">miditool</h1>
          <MidiOutputSelector onSelect={setOutput} selected={output} />
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        {output == null && (
          <p className="text-sm text-muted-foreground">
            Select a MIDI output to send notes. You can still play to preview
            chords on the keyboard.
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Keyboard</CardTitle>
            <CardAction>
              <ButtonGroup>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Octave down"
                  disabled={octave <= MIN_OCTAVE}
                  onClick={() => setOctave((prev) => prev - 1)}
                >
                  <MinusIcon />
                </Button>
                <ButtonGroupText className="min-w-24 justify-center tabular-nums">
                  Octave {octave > 0 ? `+${octave}` : octave}
                </ButtonGroupText>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Octave up"
                  disabled={octave >= MAX_OCTAVE}
                  onClick={() => setOctave((prev) => prev + 1)}
                >
                  <PlusIcon />
                </Button>
              </ButtonGroup>
            </CardAction>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <PianoKeys
              lowestNote={48 + 5} // F3
              highestNote={72 + 5} // F5
              highlightedKeys={highlighted}
              onKeyDown={(note) => output?.send(noteon(note))}
              onKeyUp={(note) => output?.send(noteoff(note))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Camelot wheel</CardTitle>
            <CardDescription>
              Press a key to play its triad, drag to move between keys.
            </CardDescription>
            <CardAction>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                value={[notation]}
                onValueChange={(value) => {
                  // Keep one option selected at all times
                  if (value.length > 0) setNotation(value[0] as Notation);
                }}
              >
                <ToggleGroupItem value="camelot">Camelot</ToggleGroupItem>
                <ToggleGroupItem value="musical">Musical</ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent className="flex justify-center">
            <CamelotWheel
              notation={notation}
              onChordDown={sendChordDown}
              onChordUp={sendChordUp}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
