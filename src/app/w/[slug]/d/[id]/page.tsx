import Link from "next/link";
import { notFound } from "next/navigation";
import { addComment, approveDeliverable } from "@/app/actions";
import { GateBadge, StatusBadge } from "@/components/badges";
import {
  getDeliverable,
  getDeliverableEvents,
  getWorkspaceBySlug,
} from "@/lib/data";
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

  const events = await getDeliverableEvents(deliverable.id);
  const comments = events.filter((e) => e.type === "comment");

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
              <input
                type="hidden"
                name="workspace_id"
                value={deliverable.workspace_id}
              />
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

      {/* Comments — recorded to the writeback log for Phase 2b. */}
      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">Comments</h2>

        {!readOnly ? (
          <form action={addComment} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="id" value={deliverable.id} />
            <input
              type="hidden"
              name="workspace_id"
              value={deliverable.workspace_id}
            />
            <textarea
              name="body"
              rows={3}
              required
              placeholder="Leave a comment for the engine…"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex w-fit items-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Comment
            </button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-neutral-400">
            Read-only demo — commenting arrives with client accounts.
          </p>
        )}

        {comments.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-4">
            {comments.map((c) => (
              <li key={c.id} className="border-l-2 border-neutral-200 pl-3">
                <p className="whitespace-pre-wrap text-sm text-neutral-800">
                  {c.body}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {formatDateTime(c.created_at)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
