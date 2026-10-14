import { EyeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Resolution } from "./spectrogram";

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: "timing", label: "Timing" },
  { value: "balanced", label: "Balanced" },
  { value: "pitch", label: "Pitch" },
];

// Zoom slider is exponential: 0 -> 10px/s, 100 -> 1000px/s
const sliderToZoom = (v: number) => 10 * Math.pow(100, v / 100);
const zoomToSlider = (zoom: number) => 50 * Math.log10(zoom / 10);

function sliderValue(value: number | readonly number[]) {
  return Array.isArray(value) ? value[0] : (value as number);
}

export function ViewControls({
  resolution,
  onResolutionChange,
  analyzing,
  zoom,
  onZoomChange,
  floorDb,
  onFloorDbChange,
}: {
  resolution: Resolution;
  onResolutionChange: (resolution: Resolution) => void;
  /** Whether an analysis is running */
  analyzing: boolean;
  /** Pixels per second */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** Quietest level shown, in dB below the loudest point */
  floorDb: number;
  onFloorDbChange: (floorDb: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <EyeIcon data-icon="inline-start" />
        View
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-4 p-4">
        <PopoverHeader>
          <PopoverTitle>View</PopoverTitle>
        </PopoverHeader>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Sharpness</Label>
            {analyzing && (
              <span className="text-xs text-muted-foreground">Analyzing…</span>
            )}
          </div>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            className="w-full"
            value={[resolution]}
            onValueChange={(value) => {
              // Keep one option selected at all times
              if (value.length > 0) onResolutionChange(value[0] as Resolution);
            }}
            aria-label="Sharpness"
          >
            {RESOLUTION_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="flex-1"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            Sharper timing blurs pitch, especially for low notes, and the other
            way round.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="view-zoom">Zoom</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(zoom)} px/s
            </span>
          </div>
          <Slider
            id="view-zoom"
            min={0}
            max={100}
            step={0.5}
            value={[zoomToSlider(zoom)]}
            onValueChange={(v) => onZoomChange(sliderToZoom(sliderValue(v)))}
          />
          <p className="text-xs text-muted-foreground">
            Or ⌘/Ctrl+scroll over the spectrogram.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="view-range">Range</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {-floorDb} dB
            </span>
          </div>
          <Slider
            id="view-range"
            min={20}
            max={100}
            value={[-floorDb]}
            onValueChange={(v) => onFloorDbChange(-sliderValue(v))}
          />
          <p className="text-xs text-muted-foreground">
            Lower hides quiet sounds, higher reveals them.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
