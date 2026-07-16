"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  createDefectType,
  updateDefectType,
  setDefectTypeActive,
  moveDefectType,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DefectTypeRow = {
  id: string;
  name: string;
  active: boolean;
  isOthers: boolean;
  defaultSubConId: string | null;
};

// label = "Company — Department" (or team name), built server-side.
type SubCon = { id: string; label: string };

// Same styled native <select> as the drawing board forms.
const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-popover [&>option]:text-popover-foreground";

type DialogState = { type: "add" } | { type: "edit"; row: DefectTypeRow } | null;

export function DefectTypeList({
  projectId,
  types,
  subCons,
}: {
  projectId: string;
  types: DefectTypeRow[];
  subCons: SubCon[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);

  const subConLabel = (id: string | null) =>
    subCons.find((s) => s.id === id)?.label ?? null;

  function openDialog(state: DialogState) {
    setError(null);
    setDialog(state);
  }

  function closeDialog() {
    setDialog(null);
    setError(null);
  }

  function submitForm(
    e: React.FormEvent<HTMLFormElement>,
    action: (fd: FormData) => Promise<{ error?: string }>,
  ) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(fd);
      if (res.error) {
        setError(res.error);
      } else {
        closeDialog();
        router.refresh();
      }
    });
  }

  function toggleActive(row: DefectTypeRow) {
    setError(null);
    startTransition(async () => {
      const res = await setDefectTypeActive({
        defectTypeId: row.id,
        active: !row.active,
      });
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  function move(row: DefectTypeRow, direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const res = await moveDefectType({ defectTypeId: row.id, direction });
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  const editing = dialog?.type === "edit" ? dialog.row : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {types.length} Defect Type{types.length === 1 ? "" : "s"}
        </p>
        <Button type="button" onClick={() => openDialog({ type: "add" })}>
          <Plus className="h-4 w-4" />
          Add Defect Type
        </Button>
      </div>

      {error && !dialog && <p className="text-sm text-destructive animate-in fade-in-0 duration-300">{error}</p>}

      <Card>
        <CardContent className="divide-y p-0">
          {types.map((row, i) => (
            <div
              key={row.id}
              className={`flex items-center gap-2 px-4 py-3 ${row.active ? "" : "opacity-60"}`}
            >
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6"
                  aria-label={`Move ${row.name} up`}
                  disabled={pending || i === 0}
                  onClick={() => move(row, "up")}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-6"
                  aria-label={`Move ${row.name} down`}
                  disabled={pending || i === types.length - 1}
                  onClick={() => move(row, "down")}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {row.name}
                  {!row.active && <Badge variant="secondary">Inactive</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.isOthers
                    ? "Shows a custom defect name field"
                    : subConLabel(row.defaultSubConId)
                      ? `Default: ${subConLabel(row.defaultSubConId)}`
                      : "No default Sub-Con"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={`Edit ${row.name}`}
                onClick={() => openDialog({ type: "edit", row })}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {!row.isOthers && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  aria-label={row.active ? `Deactivate ${row.name}` : `Activate ${row.name}`}
                  disabled={pending}
                  onClick={() => toggleActive(row)}
                >
                  {row.active ? (
                    <ToggleRight className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Add / Edit dialog (shared fields) */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {dialog && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {editing ? `Edit ${editing.name}` : "Add Defect Type"}
                </DialogTitle>
                <DialogDescription>
                  {editing?.isOthers
                    ? "Others is fixed; you can still set a default Sub-Con."
                    : "Shown in the Quick Add defect dropdown for this project."}
                </DialogDescription>
              </DialogHeader>
              <form
                key={editing?.id ?? "add"}
                onSubmit={(e) =>
                  submitForm(e, editing ? updateDefectType : createDefectType)
                }
                className="space-y-4"
              >
                {editing ? (
                  <input type="hidden" name="defectTypeId" value={editing.id} />
                ) : (
                  <input type="hidden" name="projectId" value={projectId} />
                )}
                <div className="space-y-2">
                  <Label htmlFor="dt-name">Defect Name *</Label>
                  <Input
                    id="dt-name"
                    name="name"
                    required
                    maxLength={60}
                    defaultValue={editing?.name ?? ""}
                    disabled={editing?.isOthers ?? false}
                    placeholder="e.g. Ceiling Stain"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dt-subcon">Default Sub-Con / Trade</Label>
                  <select
                    id="dt-subcon"
                    name="defaultSubConId"
                    defaultValue={editing?.defaultSubConId ?? ""}
                    className={selectClass}
                  >
                    <option value="">No default</option>
                    {subCons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                {error && <p className="text-sm text-destructive animate-in fade-in-0 duration-300">{error}</p>}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editing ? "Save changes" : "Add Defect Type"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
