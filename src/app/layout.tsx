import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Runs before hydration so the correct theme class is on <html> from the very
// first paint (no flash, no hydration mismatch). Keep the storage key in sync
// with src/components/theme-provider.tsx.
const THEME_INIT_SCRIPT = `(function () {
  try {
    var t = localStorage.getItem("parkland-theme");
    if (t !== "light" && t !== "dark") t = "system";
    var dark =
      t === "dark" ||
      (t === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(dark ? "dark" : "light");
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Parkland Defect System",
  description: "Simple floor-plan based defect management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Raw inline <script> (NOT next/script): it must run before first
            paint, and React never executes <script> tags rendered inside
            components on the client — rendering it in <head> keeps it a plain
            SSR script and silences that dev error. */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
