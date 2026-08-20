import Link from "next/link";
import { notFound } from "next/navigation";
import { approveDeliverable } from "@/app/actions";
import { GateBadge, StatusBadge } from "@/components/badges";
import { getDeliverable, getWorkspaceBySlug } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export default async function DeliverablePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const [workspace, deliverable] = await Promise.all([
    getWorkspaceBySlug(slug),
    getDeliverable(id),
  ]);
  if (!workspace || !deliverable || deliverable.workspace_id !== workspace.id) {
    notFound();
  }

  const readOnly = workspace.is_readonly;
  const canApprove = !readOnly && deliverable.status !== "approved";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/w/${slug}`}
        className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back to {workspace.name}
      </Link>

      <article className="mt-4 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {deliverable.product_type}
          </span>
          <GateBadge score={deliverable.gate_score} />
          <StatusBadge status={deliverable.status} />
        </div>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900">
          {deliverable.title}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {formatDateTime(deliverable.created_at)}
        </p>

        <hr className="my-6 border-neutral-200" />

        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800">
          {deliverable.body ?? "No content."}
        </div>

        {deliverable.external_url ? (
          <a
            href={deliverable.external_url}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center text-sm font-medium text-sky-700 hover:underline"
          >
            Open file ↗
          </a>
        ) : null}

        <div className="mt-8 flex items-center gap-3">
          {canApprove ? (
            <form action={approveDeliverable}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={deliverable.id} />
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
              >
                Approve
              </button>
            </form>
          ) : deliverable.status === "approved" ? (
            <span className="inline-flex items-center rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
              ✓ Approved
            </span>
          ) : null}
        </div>
      </article>
    </div>
  );
}
