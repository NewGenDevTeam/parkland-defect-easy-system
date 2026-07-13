"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, Plus } from "lucide-react";
import { uploadDrawing } from "../actions";
import { checkImageFile, UPLOAD_HELP_TEXT } from "@/lib/upload-limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Add Layout" dialog: uploads another Unit/Floor Layout (e.g. A-11) or marks
 * the project's Master Layout. Reuses the existing uploadDrawing action.
 */
export function AddLayoutDialog({
  projectId,
  hasMaster,
}: {
  projectId: string;
  hasMaster: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (file instanceof File) {
      const err = checkImageFile(file);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    setPending(true);
    try {
      const res = await uploadDrawing({}, fd);
      if (res.error) {
        setError(res.error);
      } else {
        close();
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-md:h-11 max-md:px-3"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Add Layout
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Layout</DialogTitle>
            <DialogDescription>
              Upload a Unit/Floor Layout (e.g. A-11)
              {hasMaster ? "." : " or the project Master Layout."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="space-y-2">
              <Label htmlFor="layout-name">Layout Name *</Label>
              <Input
                id="layout-name"
                name="name"
                required
                maxLength={60}
                placeholder="e.g. A-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="layout-file">Floor Plan Image *</Label>
              <Input id="layout-file" name="file" type="file" accept="image/*" required />
              <p className="text-xs text-muted-foreground">{UPLOAD_HELP_TEXT}</p>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="isMaster" className="size-4 accent-primary" />
              This is the Master Layout
              {hasMaster && (
                <span className="text-xs text-muted-foreground">
                  (replaces the current one)
                </span>
              )}
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageUp className="h-4 w-4" />
                )}
                Upload Layout
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
