// Shared display helpers for defect status / priority. Plain module so both
// server and client components can import it.

export type DefectStatusValue =
  | "NEW"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED"
  | "REOPENED";

export type PriorityValue = "LOW" | "MEDIUM" | "HIGH";

export const STATUS_LABEL: Record<DefectStatusValue, string> = {
  NEW: "New",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

export const PRIORITY_LABEL: Record<PriorityValue, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

// Statuses a MAIN_CON can set from the defect detail panel in Phase 2.
export const MAIN_STATUS_OPTIONS: DefectStatusValue[] = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "REOPENED",
];

// Solid pin background colour by status.
export const STATUS_PIN_COLOR: Record<DefectStatusValue, string> = {
  NEW: "bg-zinc-500",
  ASSIGNED: "bg-blue-600",
  IN_PROGRESS: "bg-amber-500",
  COMPLETED: "bg-emerald-600",
  CLOSED: "bg-zinc-800",
  REOPENED: "bg-red-600",
};

// Badge tint by status (works in light + dark).
export const STATUS_BADGE_CLASS: Record<DefectStatusValue, string> = {
  NEW: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ASSIGNED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  IN_PROGRESS:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  COMPLETED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  CLOSED: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
  REOPENED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export const PRIORITY_BADGE_CLASS: Record<PriorityValue, string> = {
  LOW: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  HIGH: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};
