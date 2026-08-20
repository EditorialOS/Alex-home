import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mailbox IN — the door the engine POSTs finished, already-scored deliverables
 * through. Protected by MAILBOX_SHARED_SECRET. No model calls, no gate calls:
 * this only moves an already-finished deliverable into a workspace's feed.
 *
 * Auth: `Authorization: Bearer <MAILBOX_SHARED_SECRET>`
 *       (or `x-mailbox-secret: <MAILBOX_SHARED_SECRET>`).
 *
 * Body (JSON):
 *   workspace     string  workspace slug        (or use client_key)
 *   client_key    string  workspace client_key  (alternative to workspace)
 *   title         string  required
 *   product_type  string  default "NewsletterOps"
 *   body          string  optional
 *   external_url  string  optional (e.g. a Box link)
 *   gate_score    number  optional, 0–100 (comes from The Gate upstream)
 *   status        string  optional: in_progress | ready | approved (default ready)
 */

const VALID_STATUSES = ["in_progress", "ready", "approved"];

function isAuthorized(req: Request): boolean {
  const secret = process.env.MAILBOX_SHARED_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const headerSecret = req.headers.get("x-mailbox-secret");
  return bearer === secret || headerSecret === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const workspaceSlug =
    typeof payload.workspace === "string" ? payload.workspace.trim() : "";
  const clientKey =
    typeof payload.client_key === "string" ? payload.client_key.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!workspaceSlug && !clientKey) {
    return NextResponse.json(
      { error: "workspace (slug) or client_key is required" },
      { status: 400 },
    );
  }

  const status =
    typeof payload.status === "string" && VALID_STATUSES.includes(payload.status)
      ? payload.status
      : "ready";

  let gateScore: number | null = null;
  if (typeof payload.gate_score === "number") {
    gateScore = Math.max(0, Math.min(100, Math.round(payload.gate_score)));
  }

  const admin = createAdminClient();

  // Resolve the workspace by slug or client_key.
  const lookup = admin.from("workspaces").select("id, slug");
  const { data: workspace, error: wsError } = clientKey
    ? await lookup.eq("client_key", clientKey).maybeSingle()
    : await lookup.eq("slug", workspaceSlug).maybeSingle();

  if (wsError) {
    return NextResponse.json({ error: wsError.message }, { status: 500 });
  }
  if (!workspace) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 },
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("deliverables")
    .insert({
      workspace_id: workspace.id,
      title,
      product_type:
        typeof payload.product_type === "string"
          ? payload.product_type
          : "NewsletterOps",
      body: typeof payload.body === "string" ? payload.body : null,
      external_url:
        typeof payload.external_url === "string" ? payload.external_url : null,
      gate_score: gateScore,
      status,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  revalidatePath(`/w/${workspace.slug}`);

  return NextResponse.json(
    { ok: true, id: inserted.id, workspace: workspace.slug },
    { status: 201 },
  );
}
