import type { DeliverableStatus, StandingOrderState } from "@/lib/types";

export function GateBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
        Gate —
      </span>
    );
  }
  const tone =
    score >= 85
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : score >= 70
        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
        : "bg-rose-50 text-rose-700 ring-rose-600/20";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}
      title="Gate score"
    >
      Gate {score}
    </span>
  );
}

const STATUS_LABEL: Record<DeliverableStatus, string> = {
  in_progress: "In progress",
  ready: "Ready",
  approved: "Approved",
};

export function StatusBadge({ status }: { status: DeliverableStatus }) {
  const tone =
    status === "approved"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : status === "ready"
        ? "bg-sky-50 text-sky-700 ring-sky-600/20"
        : "bg-neutral-100 text-neutral-600 ring-neutral-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StateBadge({ state }: { state: StandingOrderState }) {
  const tone =
    state === "active"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
      : "bg-neutral-100 text-neutral-500 ring-neutral-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${tone}`}
    >
      {state}
    </span>
  );
}
