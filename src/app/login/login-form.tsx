"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

const inputClasses =
  "h-13 rounded-2xl border-white/10 bg-white/6 px-4 text-base text-white placeholder:text-white/35 focus-visible:border-white/40 focus-visible:ring-white/15 md:text-base dark:bg-white/6 dark:disabled:bg-white/10";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    // suppressHydrationWarning (here + both credential inputs): mobile browser
    // password managers inject __gcruniqueid onto these exact elements before
    // React hydrates. Only works one level deep, so each element needs it.
    <form action={formAction} className="space-y-5" suppressHydrationWarning>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm text-white/75">
          Email Address
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="Enter your email address"
          required
          suppressHydrationWarning
          className={inputClasses}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm text-white/75">
          Password
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            suppressHydrationWarning
            className={`${inputClasses} pr-12`}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-white/45 transition-colors outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-white/25"
          >
            {showPassword ? (
              <EyeOff className="h-4.5 w-4.5" />
            ) : (
              <Eye className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          id="rememberMe"
          name="rememberMe"
          className="size-5 shrink-0 cursor-pointer rounded-md accent-white outline-none focus-visible:ring-3 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c] md:size-4"
        />
        <Label
          htmlFor="rememberMe"
          className="cursor-pointer py-2 font-normal text-white/60 select-none"
        >
          Remember me
        </Label>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2.5 text-sm text-red-200 animate-in fade-in-0 duration-300"
        >
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        className="h-13 w-full rounded-2xl bg-white text-base font-medium text-neutral-900 hover:bg-white/85 focus-visible:border-white/60 focus-visible:ring-white/30"
        disabled={pending}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Signing in…" : "Sign In"}
      </Button>
    </form>
  );
}
