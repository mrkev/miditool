import { SlidersHorizontalIcon } from "lucide-react";
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
import type { Channel, Mix } from "./mix";

const CHANNELS: { channel: Channel; label: string }[] = [
  { channel: "audio", label: "Audio" },
  { channel: "notes", label: "Notes" },
];

export function MixControls({
  mix,
  onChange,
}: {
  mix: Mix;
  onChange: (mix: Mix) => void;
}) {
  const setLevel = (channel: Channel, level: number) =>
    onChange({
      // Turning a channel up turns it on
      enabled:
        level > 0 && !mix.enabled.includes(channel)
          ? [...mix.enabled, channel]
          : mix.enabled,
      levels: { ...mix.levels, [channel]: level },
    });

  return (
    <div className="flex items-center gap-1">
      <ToggleGroup
        multiple
        variant="outline"
        size="sm"
        spacing={0}
        value={mix.enabled}
        onValueChange={(enabled) =>
          onChange({ ...mix, enabled: enabled as Channel[] })
        }
        aria-label="Playback"
      >
        {CHANNELS.map(({ channel, label }) => (
          <ToggleGroupItem key={channel} value={channel}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Popover>
        <PopoverTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label="Mix levels"
        >
          <SlidersHorizontalIcon />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 gap-4 p-4">
          <PopoverHeader>
            <PopoverTitle>Mix</PopoverTitle>
          </PopoverHeader>
          {CHANNELS.map(({ channel, label }) => {
            const on = mix.enabled.includes(channel);
            const level = mix.levels[channel];
            return (
              <div key={channel} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`mix-${channel}`}>{label}</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {on ? `${Math.round(level * 100)}%` : "Off"}
                  </span>
                </div>
                <Slider
                  id={`mix-${channel}`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={[level]}
                  className={on ? undefined : "opacity-50"}
                  onValueChange={(value) =>
                    setLevel(channel, Array.isArray(value) ? value[0] : value)
                  }
                />
              </div>
            );
          })}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() =>
                onChange({
                  enabled: ["audio", "notes"],
                  levels: { audio: 1, notes: 0.35 },
                })
              }
            >
              Favor audio
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() =>
                onChange({
                  enabled: ["audio", "notes"],
                  levels: { audio: 0.45, notes: 1 },
                })
              }
            >
              Favor notes
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
