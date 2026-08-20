import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitBrief } from "@/app/actions";
import { getWorkspaceBySlug } from "@/lib/data";

const PRODUCT_TYPES = [
  "NewsletterOps",
  "SocialOps",
  "CampaignKit",
  "ContentRepurposer",
  "EditorialStrategy",
  "StoryPackager",
];

export default async function NewBriefPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();
  // A read-only demo visitor cannot submit briefs.
  if (workspace.is_readonly) redirect(`/w/${slug}`);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href={`/w/${slug}`}
        className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back to {workspace.name}
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">New brief</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Request a new deliverable. This goes into the queue for the engine to
          pick up.
        </p>

        <form action={submitBrief} className="mt-6 flex flex-col gap-5">
          <input type="hidden" name="slug" value={slug} />

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">
              Product type
            </span>
            <select
              name="product_type"
              defaultValue="NewsletterOps"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            >
              {PRODUCT_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">
              Topic / angle
            </span>
            <input
              type="text"
              name="topic"
              required
              placeholder="e.g. Our Q3 results, told through one customer's story"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">
              Target date
            </span>
            <input
              type="date"
              name="target_date"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700">Notes</span>
            <textarea
              name="notes"
              rows={4}
              placeholder="Anything the engine should know — audience, must-haves, links."
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              Submit brief
            </button>
            <Link
              href={`/w/${slug}`}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
