export type DeliverableStatus = "in_progress" | "ready" | "approved";
export type StandingOrderState = "active" | "paused";

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  is_readonly: boolean;
  created_at: string;
};

export type Deliverable = {
  id: string;
  workspace_id: string;
  title: string;
  product_type: string;
  body: string | null;
  external_url: string | null;
  gate_score: number | null;
  status: DeliverableStatus;
  created_at: string;
  approved_at: string | null;
};

export type StandingOrder = {
  id: string;
  workspace_id: string;
  product_type: string;
  title: string;
  cadence: string | null;
  schedule: string | null;
  state: StandingOrderState;
  created_at: string;
};
