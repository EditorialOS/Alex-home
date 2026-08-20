"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Operator-only, temporary stand-in for the real mailbox (Phase 2).
 * Drops a sample newsletter into a workspace so it appears in the feed.
 * The database's RLS policy rejects this on read-only (Demo) workspaces.
 */
const SAMPLE_DELIVERABLES = [
  {
    title: "The Friday Five",
    body: "Subject line: Five things worth your Friday\n\nHappy Friday.\n\nThis week: the metric everyone tracks but no one acts on, a customer story that reframes the roadmap, and a small copy change that lifted replies by a third. Plus two links worth the click.\n\nStraight to it below.\n\n— The Desk",
  },
  {
    title: "What the numbers said this month",
    body: "Subject line: The month in three charts\n\nHi there,\n\nWe pulled the month down to three charts: where growth actually came from, where it stalled, and the one leading indicator to watch into next month. No vanity metrics.\n\nThe short version — and what we'd do about it — is inside.\n\n— The Desk",
  },
  {
    title: "A quiet week, one big idea",
    body: "Subject line: One idea, no filler\n\nWelcome back.\n\nQuiet week on the news front, so we're spending it on a single idea that keeps coming up in customer calls: the gap between what people say they want and what they actually open. Here's how we're closing it.\n\n— The Desk",
  },
];

export async function insertTestDeliverable(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  if (!slug) return;

  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) return;

  const sample =
    SAMPLE_DELIVERABLES[Math.floor(Math.random() * SAMPLE_DELIVERABLES.length)];
  // Sample gate score stands in for The Gate's verdict (wired in Phase 2).
  const gateScore = 76 + Math.floor(Math.random() * 22); // 76–97

  await supabase.from("deliverables").insert({
    workspace_id: workspace.id,
    title: sample.title,
    product_type: "NewsletterOps",
    body: sample.body,
    gate_score: gateScore,
    status: "ready",
  });

  revalidatePath(`/w/${slug}`);
}

export async function approveDeliverable(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!slug || !id) return;

  const supabase = await createClient();
  await supabase
    .from("deliverables")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/d/${id}`);
}
