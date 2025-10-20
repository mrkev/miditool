import React, { useState, useEffect } from "react";

const STORAGE_KEY = "selectedMidiOutputId";

export function MidiOutputSelector({
  selected,
  onSelect,
}: {
  selected: MIDIOutput | null;
  onSelect: (output: MIDIOutput | null) => void;
}) {
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [outputs, setOutputs] = useState<MIDIOutput[]>([]);
  const [selectedId, setSelectedId] = useState<string>(selected?.id ?? "");
  // Request MIDI access and handle device updates
  useEffect(() => {
    let access: MIDIAccess;

    async function initMIDI() {
      try {
        access = await navigator.requestMIDIAccess();
        updateOutputs(access);

        // Listen for device changes
        access.onstatechange = () => updateOutputs(access);
      } catch (err) {
        console.error("WebMIDI not supported or permission denied", err);
      }
    }

    function updateOutputs(access: MIDIAccess) {
      const list = Array.from(access.outputs.values());
      setOutputs(list);

      // Restore saved selection if available
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId && list.some((o) => o.id === savedId)) {
        setSelectedId(savedId);
        const output = list.find((o) => o.id === savedId) || null;
        onSelect(output);
      } else {
        onSelect(null);
      }
    }

    initMIDI();

    return () => {
      if (access) access.onstatechange = null;
    };
  }, [onSelect]);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);

    const output = outputs.find((o) => o.id === id) || null;
    onSelect(output);
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="midiOutput" className="font-medium">
        MIDI Output:
      </label>

      <select
        id="midiOutput"
        value={selectedId}
        onChange={handleSelect}
        className="border rounded p-2"
      >
        {outputs.length === 0 ? (
          <option value="">No MIDI outputs found</option>
        ) : (
          <>
            <option value="">Select a MIDI output</option>
            {outputs.map((output) => (
              <option key={output.id} value={output.id}>
                {output.name}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
}
