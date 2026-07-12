import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh flex-col bg-[#0b0b0c] text-white [font-family:Georgia,'Times_New_Roman',ui-serif,serif] px-[max(1.25rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:flex-row lg:gap-8 lg:p-7">
      <div className="absolute top-3 right-3 z-10 lg:top-10 lg:right-10">
        <ThemeToggle />
      </div>

      {/* Left — sign-in content */}
      <main className="flex w-full flex-1 flex-col lg:w-[52%]">
        <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-start py-6 lg:justify-center lg:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5">
              <Image
                src="/parkland-icon.png"
                alt="Parkland logo"
                width={36}
                height={36}
                preload
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-lg tracking-tight text-white/90">
              Parkland Defect System
            </span>
          </div>

          <h1 className="mt-10 text-4xl leading-tight tracking-tight sm:text-5xl lg:mt-12">
            Welcome Back
          </h1>
          <p className="mt-3 text-base text-white/55">
            Please sign in to Parkland Defect System
          </p>

          <div className="mt-9 lg:mt-10">
            <LoginForm />
          </div>

          <footer className="mt-12 lg:mt-14">
            <p className="text-sm text-white/40">
              &copy; 2026 Parkland Defect Management System. Powered by NewGen
            </p>
          </footer>
        </div>
      </main>

      {/* Right — building image panel, desktop only */}
      <aside className="relative hidden overflow-hidden rounded-[2rem] lg:block lg:w-[48%]">
        <Image
          src="/images/login-building.jpg"
          alt="Office towers at dusk"
          fill
          preload
          sizes="(min-width: 1024px) 48vw, 100vw"
          className="object-cover object-center"
        />
      </aside>
    </div>
  );
}
