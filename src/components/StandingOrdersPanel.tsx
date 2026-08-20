import { StateBadge } from "@/components/badges";
import type { StandingOrder } from "@/lib/types";

export function StandingOrdersPanel({
  orders,
  readOnly,
}: {
  orders: StandingOrder[];
  readOnly: boolean;
}) {
  return (
    <section>
      <div className="flex items-center justify-between px-1 pb-3">
        <h2 className="text-sm font-semibold text-neutral-900">
          Standing orders
        </h2>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-6 text-center text-sm text-neutral-400">
          No standing orders yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li
              key={o.id}
              className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-neutral-800">
                  {o.title}
                </p>
                <StateBadge state={o.state} />
              </div>
              {o.cadence ? (
                <p className="mt-1 text-xs text-neutral-500">{o.cadence}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 px-1 text-xs text-neutral-400">
        {readOnly
          ? "Read-only demo — pausing arrives with client accounts."
          : "Create, edit, and pause arrive with accounts in Phase 3."}
      </p>
    </section>
  );
}
