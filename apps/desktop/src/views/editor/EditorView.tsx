import { FileTree } from "./FileTree";
import { EditorTabs } from "./EditorTabs";
import { MonacoPanel } from "./MonacoPanel";
import { StatusBar } from "./StatusBar";

export function EditorView() {
  return (
    <div className="flex h-full">
      <div className="w-56 bg-bg-secondary border-r border-border shrink-0">
        <FileTree />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <EditorTabs />
        <MonacoPanel />
        <StatusBar />
      </div>
    </div>
  );
}
