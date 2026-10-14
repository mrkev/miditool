import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STORAGE_KEY = "selectedMidiOutputId";

export function MidiOutputSelector({
  selected,
  onSelect,
}: {
  selected: MIDIOutput | null;
  onSelect: (output: MIDIOutput | null) => void;
}) {
  const [outputs, setOutputs] = useState<MIDIOutput[]>([]);
  const [unsupported, setUnsupported] = useState(false);

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
        setUnsupported(true);
      }
    }

    function updateOutputs(access: MIDIAccess) {
      const list = Array.from(access.outputs.values());
      setOutputs(list);

      // Restore saved selection if available
      const savedId = localStorage.getItem(STORAGE_KEY);
      onSelect(list.find((o) => o.id === savedId) ?? null);
    }

    initMIDI();

    return () => {
      if (access) access.onstatechange = null;
    };
  }, [onSelect]);

  const items = outputs.map((output) => ({
    value: output.id,
    label: output.name ?? output.id,
  }));

  const placeholder = unsupported
    ? "WebMIDI unavailable"
    : outputs.length === 0
      ? "No MIDI outputs found"
      : "Select a MIDI output";

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="midi-output">Output</Label>
      <Select
        items={items}
        value={selected?.id ?? null}
        onValueChange={(id) => {
          localStorage.setItem(STORAGE_KEY, id ?? "");
          onSelect(outputs.find((o) => o.id === id) ?? null);
        }}
        disabled={outputs.length === 0}
      >
        <SelectTrigger id="midi-output" className="w-56">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
