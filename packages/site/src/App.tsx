import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CamelotTool } from "./CamelotTool";
import { MidiOutputSelector } from "./MidiOutputSelector";
import { TranscribeTool } from "./transcribe/TranscribeTool";

const TAB_STORAGE_KEY = "miditool:tab";
type Tab = "camelot" | "transcribe";

function loadTab(): Tab {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) === "transcribe"
      ? "transcribe"
      : "camelot";
  } catch {
    return "camelot";
  }
}

export function App() {
  const [output, setOutput] = useState<MIDIOutput | null>(null);
  // Remembered, so reloads come back to the same tool
  const [tab, setTab] = useState<Tab>(loadTab);

  return (
    <Tabs
      value={tab}
      onValueChange={(value: Tab) => {
        setTab(value);
        try {
          localStorage.setItem(TAB_STORAGE_KEY, value);
        } catch {
          // Remembering the tab is a convenience
        }
      }}
      className="h-svh gap-0"
    >
      <header className="shrink-0 border-b">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <h1 className="text-base font-semibold">miditool</h1>
          <TabsList>
            <TabsTrigger value="camelot">Camelot</TabsTrigger>
            <TabsTrigger value="transcribe">Transcribe</TabsTrigger>
          </TabsList>
          <div className="ml-auto">
            <MidiOutputSelector onSelect={setOutput} selected={output} />
          </div>
        </div>
      </header>

      <TabsContent value="camelot" className="min-h-0 overflow-auto">
        <CamelotTool output={output} />
      </TabsContent>
      {/* Keep mounted so the loaded audio and notes survive switching tabs */}
      <TabsContent value="transcribe" keepMounted className="min-h-0">
        <TranscribeTool active={tab === "transcribe"} />
      </TabsContent>
    </Tabs>
  );
}
