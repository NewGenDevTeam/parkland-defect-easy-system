"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword } from "@/lib/auth";
import { Role } from "@/generated/prisma/enums";

const PAGE = "/main/sub-contractors";
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD_LENGTH = 8;

export type SubConActionState = { error?: string };

/**
 * Ownership guard shared by every mutating action: the target must be a
 * SUB_CON created under the logged-in Main-Con. mainConId is NEVER read from
 * the browser — it always comes from the authenticated session.
 */
async function findOwnedSubCon(subConId: string, mainConId: string) {
  return prisma.user.findFirst({
    where: { id: subConId, role: Role.SUB_CON, mainConId },
  });
}

export async function createSubCon(
  formData: FormData,
): Promise<SubConActionState> {
  const user = await requireRole("MAIN_CON");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const department = String(formData.get("department") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Contact / team name is required." };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email." };
  if (!department) return { error: "Department / trade is required." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Password must be at least 8 characters." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Email is already in use." };

  // Role is hardcoded — this form can never create a MAIN_CON account.
  await prisma.user.create({
    data: {
      name,
      email,
      department,
      companyName: companyName || null,
      phone: phone || null,
      passwordHash: await hashPassword(password),
      role: Role.SUB_CON,
      mainConId: user.userId,
      active: true,
    },
  });

  revalidatePath(PAGE);
  return {};
}

export async function updateSubCon(
  formData: FormData,
): Promise<SubConActionState> {
  const user = await requireRole("MAIN_CON");

  const subConId = String(formData.get("subConId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const department = String(formData.get("department") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) return { error: "Contact / team name is required." };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email." };
  if (!department) return { error: "Department / trade is required." };

  const target = await findOwnedSubCon(subConId, user.userId);
  if (!target) return { error: "Sub-Contractor not found." };

  if (email !== target.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return { error: "Email is already in use." };
  }

  // Role is intentionally not updatable here.
  await prisma.user.update({
    where: { id: target.id },
    data: {
      name,
      email,
      department,
      companyName: companyName || null,
      phone: phone || null,
    },
  });

  revalidatePath(PAGE);
  return {};
}

export async function setSubConActive(input: {
  subConId: string;
  active: boolean;
}): Promise<SubConActionState> {
  const user = await requireRole("MAIN_CON");

  const target = await findOwnedSubCon(input.subConId, user.userId);
  if (!target) return { error: "Sub-Contractor not found." };

  // Deactivating never touches defect history — assigned defects stay as-is.
  await prisma.user.update({
    where: { id: target.id },
    data: { active: input.active },
  });

  revalidatePath(PAGE);
  return {};
}

export async function resetSubConPassword(
  formData: FormData,
): Promise<SubConActionState> {
  const user = await requireRole("MAIN_CON");

  const subConId = String(formData.get("subConId") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) return { error: "Passwords do not match." };

  const target = await findOwnedSubCon(subConId, user.userId);
  if (!target) return { error: "Sub-Contractor not found." };

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(password) },
  });

  revalidatePath(PAGE);
  return {};
}
