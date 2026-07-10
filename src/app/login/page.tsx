import { Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex items-center justify-end p-4">
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              Parkland Defect
            </h1>
            <p className="text-sm text-muted-foreground">
              Floor Plan Defect Management
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>
                Enter your credentials to continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
