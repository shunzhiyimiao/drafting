import { useEffect } from "react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { usePatchboardStore } from "../../stores/patchboard-store";
import { useHeadquartersStore } from "../../stores/headquarters-store";
import { ProjectIdentityBar } from "./ProjectIdentityBar";
import { SmartSuggestion } from "./SmartSuggestion";
import { ActionCenter } from "./ActionCenter";
import { AuxiliaryInfo } from "./AuxiliaryInfo";

export function HeadquartersView() {
  const bpInitialized = useBlueprintStore((s) => s.initialized);
  const initBlueprint = useBlueprintStore((s) => s.initialize);
  const pbInitialized = usePatchboardStore((s) => s.initialized);
  const initPatchboard = usePatchboardStore((s) => s.initialize);
  const recompute = useHeadquartersStore((s) => s.recompute);

  useEffect(() => {
    const init = async () => {
      if (!bpInitialized) await initBlueprint(".");
      if (!pbInitialized) await initPatchboard(".");
      recompute();
    };
    init();
  }, [bpInitialized, pbInitialized, initBlueprint, initPatchboard, recompute]);

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      <ProjectIdentityBar />
      <SmartSuggestion />
      <ActionCenter />
      <AuxiliaryInfo />
    </div>
  );
}
