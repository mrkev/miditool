import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CamelotTool } from "./CamelotTool";
import { MidiOutputSelector } from "./MidiOutputSelector";
import { TranscribeTool } from "./transcribe/TranscribeTool";

export function App() {
  const [output, setOutput] = useState<MIDIOutput | null>(null);

  return (
    <Tabs defaultValue="camelot" className="h-svh gap-0">
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
        <TranscribeTool />
      </TabsContent>
    </Tabs>
  );
}
