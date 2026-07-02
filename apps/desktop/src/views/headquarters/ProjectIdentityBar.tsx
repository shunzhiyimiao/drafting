import { useEffect } from "react";
import { GitBranch } from "lucide-react";
import { useHeadquartersStore, type HealthStatus } from "../../stores/headquarters-store";
import { useGitStore } from "../../stores/git-store";
import { getProjectRoot } from "../../lib/app-bootstrap";

const healthConfig: Record<
  HealthStatus,
  { label: string; color: string; dot: string }
> = {
  healthy: { label: "Healthy", color: "text-success", dot: "bg-success" },
  attention: { label: "Attention", color: "text-warning", dot: "bg-warning" },
  risk: { label: "Risk", color: "text-warning", dot: "bg-warning" },
  alert: { label: "Alert", color: "text-error", dot: "bg-error" },
};

export function ProjectIdentityBar() {
  const totalFeatures = useHeadquartersStore((s) => s.totalFeatures);
  const totalCriteria = useHeadquartersStore((s) => s.totalCriteria);
  const doneCriteria = useHeadquartersStore((s) => s.doneCriteria);
  const overallProgress = useHeadquartersStore((s) => s.overallProgress);
  const health = useHeadquartersStore((s) => s.health);
  const alerts = useHeadquartersStore((s) => s.alerts);
  const gitStatus = useGitStore((s) => s.status);
  const initializeGit = useGitStore((s) => s.initialize);

  // The git store is normally initialized by GitView, but Headquarters is the
  // default view and may render first — load it here too, skipping the
  // refresh if the store is already on this root.
  useEffect(() => {
    getProjectRoot().then((root) => {
      if (useGitStore.getState().projectRoot !== root) {
        void initializeGit(root);
      }
    });
  }, [initializeGit]);

  const h = healthConfig[health];
  const changedCount = gitStatus
    ? gitStatus.modified.length +
      gitStatus.staged.length +
      gitStatus.untracked.length +
      gitStatus.conflicted.length
    : 0;

  return (
    <div className="glass-panel flex items-center justify-between px-5 py-3.5">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">Drafting</h1>
        <ProgressRing progress={overallProgress} />
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm ${h.color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${h.dot}`} />
            {h.label}
          </span>
          <span>
            {totalFeatures} {totalFeatures === 1 ? "feature" : "features"}
          </span>
          <span>
            {doneCriteria}/{totalCriteria} criteria
          </span>
          {alerts.length > 0 && (
            <span className="text-warning">
              {alerts.length} {alerts.length === 1 ? "alert" : "alerts"}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-text-muted">
        {gitStatus &&
          (gitStatus.isRepo ? (
            <span className="flex items-center gap-1">
              <GitBranch size={12} />
              {gitStatus.branch}
              {gitStatus.isDetached && " (detached)"}
              {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
                <span>
                  ↑{gitStatus.ahead} ↓{gitStatus.behind}
                </span>
              )}
              {changedCount > 0 && <span>· {changedCount} changed</span>}
            </span>
          ) : (
            <span className="flex items-center gap-1 opacity-60">
              <GitBranch size={12} />
              no repo
            </span>
          ))}
      </div>
    </div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-9 h-9">
      <svg className="w-9 h-9 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r={radius}
          stroke="#313244"
          strokeWidth="3"
          fill="none"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          stroke="#89b4fa"
          strokeWidth="3"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-text-primary">
        {progress}%
      </span>
    </div>
  );
}
