"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, dashboardPathForRole } from "@/lib/auth";
import { createSession } from "@/lib/session";
import type { UserRole } from "@/lib/session";

export type LoginState = { error?: string };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  // Unchecked checkboxes are absent from FormData; checked ones submit "on".
  const rememberMe = formData.get("rememberMe") === "on";

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Deactivated accounts get the same generic message — never reveal that the
  // account exists but is inactive.
  if (
    !user ||
    !user.active ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    return { error: "Invalid email or password." };
  }

  await createSession(
    {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
    },
    { rememberMe },
  );

  redirect(dashboardPathForRole(user.role as UserRole));
}
