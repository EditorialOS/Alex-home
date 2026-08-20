import Link from "next/link";
import { approveDeliverable } from "@/app/actions";
import { GateBadge, StatusBadge } from "@/components/badges";
import { formatDate } from "@/lib/format";
import type { Deliverable } from "@/lib/types";

export function DeliverableCard({
  deliverable,
  slug,
  readOnly,
}: {
  deliverable: Deliverable;
  slug: string;
  readOnly: boolean;
}) {
  const d = deliverable;
  const canApprove = !readOnly && d.status !== "approved";

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-neutral-900">
            {d.title}
          </h3>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
            {d.product_type}
          </p>
        </div>
        <GateBadge score={d.gate_score} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <StatusBadge status={d.status} />
        <span className="text-neutral-400">·</span>
        <time className="text-neutral-500">{formatDate(d.created_at)}</time>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/w/${slug}/d/${d.id}`}
          className="inline-flex items-center rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Read
        </Link>

        {canApprove ? (
          <form action={approveDeliverable}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="id" value={d.id} />
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              Approve
            </button>
          </form>
        ) : d.status === "approved" ? (
          <span className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-700">
            ✓ Approved
          </span>
        ) : null}
      </div>
    </article>
  );
}
