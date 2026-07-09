import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { dashboardPathForRole } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  redirect(session ? dashboardPathForRole(session.role) : "/login");
}
