"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronRight,
  LayoutDashboard,
  ClipboardList,
  FolderKanban,
  Menu,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutMenuItem } from "@/components/logout-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserRole = "MAIN_CON" | "SUB_CON";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  // exact = active only on an exact path match (used for index/dashboard routes
  // so a nested route like /main/projects does not also activate /main).
  exact?: boolean;
};

const NAV: Record<UserRole, NavItem[]> = {
  MAIN_CON: [
    // Projects first: it is the Main-Con landing page after login (pick a
    // project → floor plan → add defects). Dashboard stays available below.
    { label: "Projects", href: "/main/projects", icon: FolderKanban },
    { label: "Dashboard", href: "/main", icon: LayoutDashboard, exact: true },
    { label: "Defects", href: "/main/defects", icon: ClipboardList },
    { label: "Sub-Contractors", href: "/main/sub-contractors", icon: UsersRound },
  ],
  SUB_CON: [
    { label: "My Defects", href: "/sub", icon: ClipboardList },
  ],
};

const ROLE_LABEL: Record<UserRole, string> = {
  MAIN_CON: "Main-Con",
  SUB_CON: "Sub-Con",
};

// --- Mobile drawer swipe gestures ------------------------------------------
// Best-effort enhancement: swipe right from the left screen edge opens the
// drawer; swipe left on the open drawer/overlay closes it. Touch-only and
// small-screen-only; hamburger / X / overlay / links stay the primary
// controls.
//
// Why Touch Events (not Pointer Events): once the browser decides a touch is
// a scroll it fires pointercancel and the gesture dies, so a passive
// pointer-based detector never sees the swipe complete. With touch events we
// can wait for horizontal intent within the first few px of movement and only
// then claim the gesture via preventDefault (touchmove listener is attached
// non-passively ONLY for the duration of a candidate gesture, so normal page
// scrolling never pays for it). Vertical movement or a wrong-direction swipe
// hands control straight back to the browser untouched.

/**
 * Open gesture must start within this many px of the left screen edge.
 * Deliberately wide (not just the extreme edge): iPhone Safari/Chrome reserve
 * the outermost ~20px for the browser's own back/forward gesture, so relying
 * on it alone is unreliable — starting anywhere in this zone works instead.
 */
const SWIPE_EDGE_PX = 72;
/** Horizontal travel required to open/close the drawer. */
const SWIPE_DISTANCE_PX = 70;
/** Horizontal movement must clearly dominate vertical movement. */
const SWIPE_AXIS_RATIO = 1.3;
/** Movement needed before we commit to (or reject) a horizontal intent. */
const SWIPE_INTENT_PX = 10;
/** Tailwind `md` breakpoint: at and above it the fixed sidebar is shown. */
const MD_BREAKPOINT_PX = 768;

// Interactive elements and gesture-owning areas (floor plan viewer, dialogs)
// where an edge swipe must never start.
const SWIPE_EXCLUDE_SELECTOR =
  'button, a, input, textarea, select, [role="dialog"], [data-slot="dialog-overlay"], [data-disable-nav-swipe="true"]';
// …except the edge handle, which exists precisely to receive this gesture
// (it is a <button>, so it would otherwise match the exclusion above).
const SWIPE_HANDLE_SELECTOR = '[data-nav-swipe-handle="true"]';

type SwipeState = { x: number; y: number; claimed: boolean };

/**
 * Shared horizontal-swipe step: returns "done" when the swipe completed in
 * `direction` (+1 right / -1 left), "reject" when the movement is vertical
 * (scrolling) or the wrong way, "track" while still in progress. Claims the
 * gesture (preventDefault) only after horizontal intent is established.
 */
function stepSwipe(
  state: SwipeState,
  e: TouchEvent,
  direction: 1 | -1,
): "done" | "reject" | "track" {
  if (e.touches.length !== 1) return "reject"; // multi-touch (pinch etc.)
  const t = e.touches[0];
  const dx = t.clientX - state.x;
  const dy = t.clientY - state.y;
  if (!state.claimed) {
    if (Math.hypot(dx, dy) < SWIPE_INTENT_PX) return "track"; // too early
    if (dx * direction <= 0 || Math.abs(dx) <= Math.abs(dy) * SWIPE_AXIS_RATIO) {
      return "reject"; // vertical scroll or wrong direction — browser's touch
    }
    state.claimed = true;
  }
  // Ours now: stop the browser from starting a scroll / native gesture.
  if (e.cancelable) e.preventDefault();
  return dx * direction >= SWIPE_DISTANCE_PX &&
    Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO
    ? "done"
    : "track";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: UserRole };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV[user.role];

  // Close the drawer on any route change (covers back/forward navigation, not
  // just link taps) so it never sticks open over the new page. Render-time
  // state adjustment per react.dev/learn/you-might-not-need-an-effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // Lock background scrolling while the drawer is open; restore on close.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Swipe-right from the left edge opens the drawer. Document-level because
  // the gesture starts on arbitrary page content; gated to single-touch,
  // small screens, the edge zone, and non-interactive targets, so it can
  // never shadow the floor plan, dialogs, scrolling, or plain taps.
  const mobileOpenRef = useRef(mobileOpen);
  useEffect(() => {
    mobileOpenRef.current = mobileOpen;
  }, [mobileOpen]);
  useEffect(() => {
    let state: SwipeState | null = null;

    const onTouchMove = (e: TouchEvent) => {
      if (!state) return;
      const result = stepSwipe(state, e, 1);
      if (result === "done") {
        cleanup();
        setMobileOpen(true);
      } else if (result === "reject") {
        cleanup();
      }
    };
    const cleanup = () => {
      state = null;
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", cleanup);
      document.removeEventListener("touchcancel", cleanup);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (state) {
        cleanup(); // a second finger joined — abandon the gesture
        return;
      }
      if (e.touches.length !== 1) return;
      if (mobileOpenRef.current) return; // closing is handled on the drawer
      if (window.innerWidth >= MD_BREAKPOINT_PX) return; // fixed sidebar shown
      const t = e.touches[0];
      if (t.clientX > SWIPE_EDGE_PX) return;
      if (
        e.target instanceof Element &&
        !e.target.closest(SWIPE_HANDLE_SELECTOR) &&
        e.target.closest(SWIPE_EXCLUDE_SELECTOR)
      ) {
        return;
      }
      state = { x: t.clientX, y: t.clientY, claimed: false };
      // Non-passive only while this candidate gesture is alive.
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", cleanup, { passive: true });
      document.addEventListener("touchcancel", cleanup, { passive: true });
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => {
      cleanup();
      document.removeEventListener("touchstart", onTouchStart);
    };
  }, []);

  // Swipe-left anywhere on the open drawer (sidebar or overlay) closes it.
  // Native listeners scoped to the drawer element (React's own touch handlers
  // are passive, so they could not claim the gesture). Taps and vertical nav
  // scrolling keep native behaviour — only a clearly horizontal left swipe is
  // claimed.
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!mobileOpen || !drawer) return;
    let state: SwipeState | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (state || e.touches.length !== 1) {
        state = null; // multi-touch — abandon the gesture
        return;
      }
      const t = e.touches[0];
      state = { x: t.clientX, y: t.clientY, claimed: false };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!state) return;
      const result = stepSwipe(state, e, -1);
      if (result === "done") {
        state = null;
        setMobileOpen(false);
      } else if (result === "reject") {
        state = null;
      }
    };
    const reset = () => {
      state = null;
    };

    drawer.addEventListener("touchstart", onTouchStart, { passive: true });
    drawer.addEventListener("touchmove", onTouchMove, { passive: false });
    drawer.addEventListener("touchend", reset, { passive: true });
    drawer.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      drawer.removeEventListener("touchstart", onTouchStart);
      drawer.removeEventListener("touchmove", onTouchMove);
      drawer.removeEventListener("touchend", reset);
      drawer.removeEventListener("touchcancel", reset);
    };
  }, [mobileOpen]);

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors",
              active
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2 px-4 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="h-5 w-5" />
      </div>
      <span className="text-sm font-semibold">Parkland Defect</span>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-muted/40">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:flex">
        {brand}
        {nav}
      </aside>

      {/* Mobile edge handle: a visible, reliable way to open the drawer since
          iPhone browsers may capture the extreme left-edge swipe for their own
          back gesture. Tap opens; a right-swipe starting on it opens too (it is
          exempted from the swipe exclusion list). Hidden while the drawer is
          open and on md+ where the fixed sidebar exists. The after: pseudo
          extends the touch target to ~44px without growing the visible tab. */}
      {!mobileOpen && (
        <button
          type="button"
          aria-label="Open navigation"
          data-nav-swipe-handle="true"
          onClick={() => setMobileOpen(true)}
          className="fixed top-1/2 left-0 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 bg-background/80 text-muted-foreground shadow-sm backdrop-blur after:absolute after:-inset-y-3 after:left-0 after:-right-5 after:content-[''] md:hidden"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div ref={drawerRef} className="fixed inset-0 z-40 md:hidden">
          {/* Real <button> instead of a div: iOS Safari does not reliably
              deliver delegated click events for non-interactive elements. */}
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 h-full w-full cursor-default bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col overflow-y-auto border-r bg-background">
            <div className="flex items-center justify-between pr-2">
              {brand}
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="size-11"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="size-11 -ml-2 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="flex items-center gap-2 px-2" />
                }
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:inline">
                  {user.name}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex flex-col gap-1 px-2 py-1.5 text-sm font-medium">
                  <span>{user.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                  <Badge variant="secondary" className="mt-1 w-fit">
                    {ROLE_LABEL[user.role]}
                  </Badge>
                </div>
                <DropdownMenuSeparator />
                <LogoutMenuItem />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
