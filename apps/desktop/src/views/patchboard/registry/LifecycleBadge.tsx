import type { SocketLifecycle } from "../../../types/patchboard-types";

const styles: Record<SocketLifecycle, string> = {
  draft: "bg-accent/20 text-accent",
  stable: "bg-success/20 text-success",
  deprecated: "bg-warning/20 text-warning",
  removed: "bg-error/20 text-error",
};

export function LifecycleBadge({ lifecycle }: { lifecycle: SocketLifecycle }) {
  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${styles[lifecycle]}`}
    >
      {lifecycle}
    </span>
  );
}
