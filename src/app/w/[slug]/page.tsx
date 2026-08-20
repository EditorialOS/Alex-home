import { notFound } from "next/navigation";
import { insertTestDeliverable } from "@/app/actions";
import { DeliverableCard } from "@/components/DeliverableCard";
import { StandingOrdersPanel } from "@/components/StandingOrdersPanel";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import {
  getDeliverables,
  getStandingOrders,
  getWorkspaceBySlug,
  getWorkspaces,
} from "@/lib/data";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [workspaces, workspace] = await Promise.all([
    getWorkspaces(),
    getWorkspaceBySlug(slug),
  ]);
  if (!workspace) notFound();

  const [deliverables, standingOrders] = await Promise.all([
    getDeliverables(workspace.id),
    getStandingOrders(workspace.id),
  ]);

  const readOnly = workspace.is_readonly;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight text-neutral-900">
              Alex Home
            </span>
            <span className="text-sm text-neutral-400">deliverables</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        {/* Left — client switcher */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <WorkspaceSwitcher workspaces={workspaces} activeSlug={slug} />
        </aside>

        {/* Middle — deliverables feed */}
        <main className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">
                {workspace.name}
              </h1>
              <p className="text-sm text-neutral-500">
                {deliverables.length}{" "}
                {deliverables.length === 1 ? "deliverable" : "deliverables"}
                {readOnly ? " · read-only demo" : ""}
              </p>
            </div>

            {!readOnly ? (
              <form action={insertTestDeliverable}>
                <input type="hidden" name="slug" value={slug} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                  title="Operator-only — temporary stand-in for the mailbox (Phase 2)"
                >
                  + Insert test deliverable
                </button>
              </form>
            ) : null}
          </div>

          {deliverables.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white/50 px-6 py-16 text-center">
              <p className="text-sm font-medium text-neutral-600">
                No deliverables yet.
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                {readOnly
                  ? "Finished work will appear here."
                  : "Click “Insert test deliverable” to drop a sample newsletter into the feed."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {deliverables.map((d) => (
                <DeliverableCard
                  key={d.id}
                  deliverable={d}
                  slug={slug}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
        </main>

        {/* Right — standing orders */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <StandingOrdersPanel orders={standingOrders} readOnly={readOnly} />
        </aside>
      </div>
    </div>
  );
}
