"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import {
  createSubCon,
  updateSubCon,
  setSubConActive,
  resetSubConPassword,
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

export type SubConRow = {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  department: string | null;
  phone: string | null;
  active: boolean;
};

type DialogState =
  | { type: "add" }
  | { type: "edit"; sub: SubConRow }
  | { type: "reset"; sub: SubConRow }
  | null;

export function SubConList({ subCons }: { subCons: SubConRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);

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

  function toggleActive(sub: SubConRow) {
    setError(null);
    startTransition(async () => {
      const res = await setSubConActive({
        subConId: sub.id,
        active: !sub.active,
      });
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  const editing = dialog?.type === "edit" ? dialog.sub : null;
  const resetting = dialog?.type === "reset" ? dialog.sub : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {subCons.length} Sub-Contractor{subCons.length === 1 ? "" : "s"}
        </p>
        <Button type="button" onClick={() => openDialog({ type: "add" })}>
          <Plus className="h-4 w-4" />
          Add Sub-Contractor
        </Button>
      </div>

      {error && !dialog && <p className="text-sm text-destructive">{error}</p>}

      {subCons.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <UsersRound className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No Sub-Contractors yet</p>
            <p className="text-sm text-muted-foreground">
              Add teams such as Plumbing, Tiling or Painting, then assign
              defects to them.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {subCons.map((sub) => (
            <Card key={sub.id} className={sub.active ? "" : "opacity-70"}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{sub.name}</p>
                    {sub.companyName && (
                      <p className="truncate text-sm text-muted-foreground">
                        {sub.companyName}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={
                      sub.active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }
                  >
                    {sub.active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  {sub.department && (
                    <Badge variant="outline">{sub.department}</Badge>
                  )}
                  <p className="flex items-center gap-1.5 truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {sub.email}
                  </p>
                  {sub.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {sub.phone}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDialog({ type: "edit", sub })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDialog({ type: "reset", sub })}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Reset Password
                  </Button>
                  <Button
                    type="button"
                    variant={sub.active ? "destructive" : "secondary"}
                    size="sm"
                    disabled={pending}
                    onClick={() => toggleActive(sub)}
                  >
                    {sub.active ? (
                      <UserRoundX className="h-3.5 w-3.5" />
                    ) : (
                      <UserRoundCheck className="h-3.5 w-3.5" />
                    )}
                    {sub.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog
        open={dialog?.type === "add"}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Sub-Contractor</DialogTitle>
            <DialogDescription>
              Create a login for a team such as Plumbing or Tiling. They sign
              in with this email and password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => submitForm(e, createSubCon)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sc-name">Contact / Team Name *</Label>
              <Input id="sc-name" name="name" required placeholder="e.g. Plumbing Team" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sc-email">Email *</Label>
              <Input id="sc-email" name="email" type="email" required placeholder="e.g. plumbing@company.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sc-department">Department / Trade *</Label>
              <Input id="sc-department" name="department" required placeholder="e.g. Plumbing" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sc-password">Temporary Password *</Label>
              <Input
                id="sc-password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sc-company">Company Name</Label>
              <Input id="sc-company" name="companyName" placeholder="e.g. ABC Plumbing Services (optional)" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sc-phone">Phone</Label>
              <Input id="sc-phone" name="phone" placeholder="Optional" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Sub-Contractor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (key remounts the form when a different row is edited) */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Sub-Contractor</DialogTitle>
                <DialogDescription>
                  Update contact and company details. The role cannot change.
                </DialogDescription>
              </DialogHeader>
              <form
                key={editing.id}
                onSubmit={(e) => submitForm(e, updateSubCon)}
                className="space-y-4"
              >
                <input type="hidden" name="subConId" value={editing.id} />
                <div className="space-y-2">
                  <Label htmlFor="se-name">Contact / Team Name *</Label>
                  <Input id="se-name" name="name" required defaultValue={editing.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="se-email">Email *</Label>
                  <Input id="se-email" name="email" type="email" required defaultValue={editing.email} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="se-department">Department / Trade *</Label>
                  <Input id="se-department" name="department" required defaultValue={editing.department ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="se-company">Company Name</Label>
                  <Input id="se-company" name="companyName" defaultValue={editing.companyName ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="se-phone">Phone</Label>
                  <Input id="se-phone" name="phone" defaultValue={editing.phone ?? ""} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save changes
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetting !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          {resetting && (
            <>
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                  Set a new password for {resetting.name}. The old password
                  stops working immediately.
                </DialogDescription>
              </DialogHeader>
              <form
                key={resetting.id}
                onSubmit={(e) => submitForm(e, resetSubConPassword)}
                className="space-y-4"
              >
                <input type="hidden" name="subConId" value={resetting.id} />
                <div className="space-y-2">
                  <Label htmlFor="sp-password">New Password *</Label>
                  <Input
                    id="sp-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sp-confirm">Confirm Password *</Label>
                  <Input
                    id="sp-confirm"
                    name="confirm"
                    type="password"
                    required
                    minLength={8}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Reset Password
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
