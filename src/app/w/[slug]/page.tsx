import Link from "next/link";
import { notFound } from "next/navigation";
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ brief?: string }>;
}) {
  const { slug } = await params;
  const { brief } = await searchParams;
  const briefQueued = brief === "queued";

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
              <Link
                href={`/w/${slug}/new-brief`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700"
              >
                + New brief
              </Link>
            ) : null}
          </div>

          {briefQueued ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Brief submitted — it&rsquo;s in the queue for the engine to pick up.
            </div>
          ) : null}

          {deliverables.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white/50 px-6 py-16 text-center">
              <p className="text-sm font-medium text-neutral-600">
                No deliverables yet.
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                {readOnly
                  ? "Finished work will appear here."
                  : "Finished work from the engine lands here. Submit a brief to request more."}
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
