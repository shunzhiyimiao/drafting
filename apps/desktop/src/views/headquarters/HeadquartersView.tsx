import { ProjectIdentityBar } from "./ProjectIdentityBar";
import { SmartSuggestion } from "./SmartSuggestion";
import { ActionCenter } from "./ActionCenter";
import { AuxiliaryInfo } from "./AuxiliaryInfo";

export function HeadquartersView() {
  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      <ProjectIdentityBar />
      <SmartSuggestion />
      <ActionCenter />
      <AuxiliaryInfo />
    </div>
  );
}
