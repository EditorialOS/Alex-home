import Link from "next/link";
import type { Workspace } from "@/lib/types";

export function WorkspaceSwitcher({
  workspaces,
  activeSlug,
}: {
  workspaces: Workspace[];
  activeSlug: string;
}) {
  return (
    <nav className="flex flex-col gap-1">
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Workspaces
      </p>
      {workspaces.map((w) => {
        const active = w.slug === activeSlug;
        return (
          <Link
            key={w.id}
            href={`/w/${w.slug}`}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-neutral-900 text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            <span className="truncate">{w.name}</span>
            {w.is_readonly ? (
              <span
                className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-neutral-200 text-neutral-500"
                }`}
                title="Read-only"
              >
                Read-only
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
