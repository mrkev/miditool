import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

export function SuggestControls({
  active,
  onActiveChange,
  sensitivity,
  onSensitivityChange,
  count,
  onAcceptAll,
}: {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  sensitivity: number;
  onSensitivityChange: (sensitivity: number) => void;
  count: number;
  onAcceptAll: () => void;
}) {
  return (
    <Popover
      onOpenChange={(open) => {
        // Opening the popover is the way in, so start suggesting right away
        if (open && !active) onActiveChange(true);
      }}
    >
      <PopoverTrigger render={<Button variant="outline" />}>
        <SparklesIcon data-icon="inline-start" />
        {active ? `${count} suggested` : "Suggest"}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-4 p-4">
        <PopoverHeader>
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>Suggest notes</PopoverTitle>
            <Switch
              checked={active}
              onCheckedChange={onActiveChange}
              aria-label="Show suggestions"
            />
          </div>
          <PopoverDescription>
            Detects likely notes in the spectrogram and shows them as dashed
            outlines. Click one to add it. Accepted notes snap to the grid.
          </PopoverDescription>
        </PopoverHeader>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="suggest-sensitivity">Sensitivity</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(sensitivity * 100)}%
            </span>
          </div>
          <Slider
            id="suggest-sensitivity"
            min={0}
            max={1}
            step={0.01}
            value={[sensitivity]}
            onValueChange={(value) => {
              onSensitivityChange(Array.isArray(value) ? value[0] : value);
              if (!active) onActiveChange(true);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Higher finds quieter notes, but also more false ones.
          </p>
        </div>

        <Button disabled={!active || count === 0} onClick={onAcceptAll}>
          Accept all {active && count > 0 ? `(${count})` : ""}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
