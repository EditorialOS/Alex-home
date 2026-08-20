import { redirect } from "next/navigation";

export default function Home() {
  // Phase 1 has no login yet — land directly on the first workspace.
  redirect("/w/asap-edit");
}
