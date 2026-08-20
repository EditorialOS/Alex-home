"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Brief intake (spec 5b). Writes a row into the `briefs` queue.
 * Phase 2b picks it up — nothing processes it here.
 */
export async function submitBrief(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  const productType = String(formData.get("product_type") ?? "NewsletterOps");
  const targetDate = String(formData.get("target_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!slug || !topic) return;

  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) return;

  await supabase.from("briefs").insert({
    workspace_id: workspace.id,
    product_type: productType,
    topic,
    target_date: targetDate || null,
    notes: notes || null,
  });

  redirect(`/w/${slug}?brief=queued`);
}

/**
 * Approve a deliverable: flip its status AND record an approval event so
 * Phase 2b can forward it to the Context API.
 */
export async function approveDeliverable(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const workspaceId = String(formData.get("workspace_id") ?? "");
  if (!slug || !id || !workspaceId) return;

  const supabase = await createClient();

  await supabase
    .from("deliverables")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id);

  await supabase.from("deliverable_events").insert({
    deliverable_id: id,
    workspace_id: workspaceId,
    type: "approval",
  });

  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/d/${id}`);
}

/**
 * Comment on a deliverable: record a comment event (writeback log for 2b).
 */
export async function addComment(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!slug || !id || !workspaceId || !body) return;

  const supabase = await createClient();
  await supabase.from("deliverable_events").insert({
    deliverable_id: id,
    workspace_id: workspaceId,
    type: "comment",
    body,
  });

  revalidatePath(`/w/${slug}/d/${id}`);
}
