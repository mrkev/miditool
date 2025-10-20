import { LinkedSet, useLinkedSet } from "@mrkev/substate/LinkedSet";
import { useState } from "react";
import "./App.css";
import { CamelotChord, camelotToMidi } from "./CamelotChord";
import CamelotWheel from "./CamelotWheel";
import { getMajorTriad } from "./chords";
import { MidiOutputSelector } from "./MidiOutputSelector";
import PianoKeys from "./PianoKeys";
import { noteoff, noteon } from "./utils/midi";

const highlightedSet = LinkedSet.create<number>(new Set());

export function App() {
  const [output, setOutput] = useState<MIDIOutput | null>(null);
  const [octave, setOctave] = useState(0);
  const [logArr, setLogArr] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState<number[]>([]);
  const linkedSet = useLinkedSet(highlightedSet);

  function log(str: string) {
    setLogArr((prev) => [str, ...prev]);
  }

  const sendNote = () => {
    if (!output) {
      alert("No MIDI output selected!");
      return;
    }

    // Middle C on, then off after 0.5s
    const NOTE_ON = [0x90, 60, 127];
    const NOTE_OFF = [0x80, 60, 0];
    output.send(NOTE_ON);
    output.send(NOTE_OFF, window.performance.now() + 500);
  };

  const sendChordDown = (chord: CamelotChord) => {
    if (!output) {
      alert("No MIDI output selected!");
      return;
    }

    const notes = getMajorTriad(camelotToMidi[chord]);
    setHighlighted(notes);
    for (const note of notes) {
      output.send(noteon(note + octave * 12));
    }
    log("sent");
  };

  const sendChordUp = (chord: CamelotChord) => {
    if (!output) {
      alert("No MIDI output selected!");
      return;
    }

    const notes = getMajorTriad(camelotToMidi[chord]);

    for (const note of notes) {
      output.send(noteoff(note + octave * 12), window.performance.now());
    }
    log("done");
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <MidiOutputSelector onSelect={setOutput} selected={output} />
      <div className="flex flex-row">
        <button
          onClick={() => setOctave((prev) => prev - 1)}
          className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
        >
          -
        </button>
        [{octave}]
        <button
          onClick={() => setOctave((prev) => prev + 1)}
          className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
        >
          +
        </button>
      </div>
      <PianoKeys
        lowestNote={48 + 5} // C3
        highestNote={72 + 5} // C5
        highlightedKeys={highlighted}
        onKeyDown={(note) => console.log("Key Down:", note)}
        onKeyUp={(note) => console.log("Key Up:", note)}
      />
      <CamelotWheel
        onChordDown={sendChordDown}
        onChordUp={sendChordUp}

        // onChordClick={(chord) => {
        //   console.log("8B (C major):", camelotToMidi[chord]);
        //   const triad = getMajorTriad(camelotToMidi[chord]);
        //   sendChord(triad);
        // }}
      />
      {/* <pre>{logArr.join("\n")}</pre> */}
    </div>
  );
}
