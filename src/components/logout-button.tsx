"use client";

import { useRef } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/app/logout/actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function LogoutMenuItem() {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={logout} className="hidden" />
      <DropdownMenuItem
        variant="destructive"
        className="cursor-pointer"
        onClick={() => formRef.current?.requestSubmit()}
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </DropdownMenuItem>
    </>
  );
}
