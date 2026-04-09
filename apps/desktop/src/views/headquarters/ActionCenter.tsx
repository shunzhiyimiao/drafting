import { FeatureList } from "./FeatureList";
import { AlertsTodos } from "./AlertsTodos";

export function ActionCenter() {
  return (
    <div className="flex gap-4 flex-1 min-h-0">
      <div className="w-3/5">
        <FeatureList />
      </div>
      <div className="w-2/5">
        <AlertsTodos />
      </div>
    </div>
  );
}
