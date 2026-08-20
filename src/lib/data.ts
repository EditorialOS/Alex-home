import { createClient } from "@/lib/supabase/server";
import type {
  Deliverable,
  DeliverableEvent,
  StandingOrder,
  Workspace,
} from "@/lib/types";

/** All workspaces, for the left-hand client switcher. */
export async function getWorkspaces(): Promise<Workspace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .order("is_readonly", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getWorkspaceBySlug(
  slug: string,
): Promise<Workspace | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Deliverables for a workspace, newest first. */
export async function getDeliverables(
  workspaceId: string,
): Promise<Deliverable[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverables")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDeliverable(id: string): Promise<Deliverable | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverables")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getDeliverableEvents(
  deliverableId: string,
): Promise<DeliverableEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverable_events")
    .select("*")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getStandingOrders(
  workspaceId: string,
): Promise<StandingOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("standing_orders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
