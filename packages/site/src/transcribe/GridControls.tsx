import { Grid3x3Icon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import { SNAP_OPTIONS, tapTempo, type Grid } from "./grid";

/** Short label for the snap setting, eg. "1/16" or "1/8T" */
function snapLabel(grid: Grid) {
  if (grid.snap === "off") return "no snap";
  const label = SNAP_OPTIONS.find((o) => o.value === grid.snap)?.label;
  return `${label}${grid.triplet ? "T" : ""}`;
}

/** Taps further apart than this start a new tempo */
const TAP_RESET_MS = 2000;

function NumberField({
  id,
  value,
  onChange,
  min,
  max,
  step,
  className,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  className?: string;
}) {
  // Draft text while typing, so partial input like "1." isn't clobbered
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      className={className}
      value={draft ?? String(Math.round(value * 1000) / 1000)}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = Number(e.target.value);
        if (e.target.value !== "" && parsed >= min && parsed <= max) {
          onChange(parsed);
        }
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function GridControls({
  grid,
  onChange,
  cursor,
}: {
  grid: Grid;
  onChange: (grid: Grid) => void;
  /** Playback position, or the cursor when stopped */
  cursor: number;
}) {
  const tapsRef = useRef<number[]>([]);
  const update = (fields: Partial<Grid>) =>
    onChange({ ...grid, ...fields, enabled: true });

  const tap = () => {
    const now = performance.now();
    const taps = tapsRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_RESET_MS) {
      taps.length = 0;
    }
    taps.push(now);
    const bpm = tapTempo(taps.slice(-8));
    if (bpm != null) update({ bpm });
  };

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <Grid3x3Icon data-icon="inline-start" />
        {grid.enabled ? `${grid.bpm} BPM · ${snapLabel(grid)}` : "Grid"}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-4 p-4">
        <PopoverHeader>
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>Tempo grid</PopoverTitle>
            <Switch
              checked={grid.enabled}
              onCheckedChange={(enabled) => onChange({ ...grid, enabled })}
              aria-label="Show tempo grid"
            />
          </div>
          <PopoverDescription>
            Shows bars and beats, snaps notes to them (hold Shift to place
            freely) and sets the exported MIDI tempo.
          </PopoverDescription>
        </PopoverHeader>

        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <Label htmlFor="grid-bpm">Tempo</Label>
          <div className="flex gap-1">
            <NumberField
              id="grid-bpm"
              className="w-20"
              value={grid.bpm}
              min={20}
              max={400}
              step={0.1}
              onChange={(bpm) => update({ bpm })}
            />
            <Button variant="outline" onClick={tap}>
              Tap
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Halve tempo"
              onClick={() => update({ bpm: Math.max(20, grid.bpm / 2) })}
            >
              ½
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Double tempo"
              onClick={() => update({ bpm: Math.min(400, grid.bpm * 2) })}
            >
              2×
            </Button>
          </div>

          <Label htmlFor="grid-beats">Beats/bar</Label>
          <NumberField
            id="grid-beats"
            className="w-20"
            value={grid.beatsPerBar}
            min={1}
            max={16}
            step={1}
            onChange={(beatsPerBar) =>
              update({ beatsPerBar: Math.round(beatsPerBar) })
            }
          />

          <Label htmlFor="grid-offset">Bar 1 at</Label>
          <div className="flex gap-1">
            <NumberField
              id="grid-offset"
              className="w-20"
              value={grid.offset}
              min={0}
              max={36000}
              step={0.01}
              onChange={(offset) => update({ offset })}
            />
            <Button
              variant="outline"
              onClick={() => update({ offset: cursor })}
            >
              Use cursor
            </Button>
          </div>

          <Label htmlFor="grid-snap">Snap</Label>
          <Select
            items={SNAP_OPTIONS}
            value={grid.snap}
            onValueChange={(snap) => update({ snap: snap ?? "off" })}
          >
            <div className="flex gap-1">
              <SelectTrigger id="grid-snap" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <Toggle
                variant="outline"
                className="data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:hover:bg-primary/85 data-pressed:hover:text-primary-foreground"
                pressed={grid.triplet}
                onPressedChange={(triplet) => update({ triplet })}
              >
                Triplet
              </Toggle>
            </div>
            <SelectContent>
              {SNAP_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
