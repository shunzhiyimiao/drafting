import { useNavigationStore, type ViewId } from "../stores/navigation-store";
import { HeadquartersView } from "../views/headquarters/HeadquartersView";
import { BlueprintView } from "../views/blueprint/BlueprintView";
import { SketchView } from "../views/sketch/SketchView";
import { PatchboardView } from "../views/patchboard/PatchboardView";
import { AtlasView } from "../views/atlas/AtlasView";
import { EditorView } from "../views/editor/EditorView";
import { GitView } from "../views/git/GitView";
import { TerminalView } from "../views/terminal/TerminalView";
import { SettingsView } from "../views/settings/SettingsView";

const views: Record<ViewId, React.FC> = {
  headquarters: HeadquartersView,
  blueprint: BlueprintView,
  sketch: SketchView,
  patchboard: PatchboardView,
  atlas: AtlasView,
  editor: EditorView,
  git: GitView,
  terminal: TerminalView,
  settings: SettingsView,
};

export function MainContent() {
  const activeView = useNavigationStore((s) => s.activeView);
  const View = views[activeView];

  return (
    <div className="flex-1 overflow-auto">
      <View />
    </div>
  );
}
