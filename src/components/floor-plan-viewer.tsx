"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  Crosshair,
  Expand,
  MapPin,
  Maximize,
  Minimize,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Zoomable / pannable floor plan viewer shared by the Main-Con drawing board
 * and the Sub-Con defect detail page.
 *
 * Coordinate model (important):
 * - Defect.x / Defect.y are normalized 0–1 values relative to the ORIGINAL
 *   image, exactly as stored in the database. The viewer never stores viewport
 *   coordinates.
 * - The image and all pins live inside one "content layer" that is scaled and
 *   translated together (`translate(tx,ty) scale(s)`, origin top-left), so pin
 *   positions stay correct at every zoom level and on resize (pins use % of
 *   the content layer, which is the unscaled image box).
 * - Pins get an inverse `scale(1/s)` so they keep a constant on-screen size.
 * - Pointer → image conversion is the inverse transform:
 *   x = ((px - tx) / s) / contentWidth, clamped to 0–1.
 */

export type ViewerPin = {
  id: string;
  x: number; // 0–1 normalized
  y: number; // 0–1 normalized
  /** Pin number shown inside the circle; falls back to a map-pin icon. */
  label?: string | number;
  /** Status color class, e.g. from STATUS_PIN_COLOR. */
  colorClass: string;
  title?: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const WHEEL_STEP = 1.2;
const BUTTON_STEP = 1.5;
const FOCUS_SCALE = 2.5;
/** Taps that move less than this many px still count as a click, not a pan. */
const TAP_SLOP_PX = 8;
/** Two taps within this window and distance count as a double-tap (touch). */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 40;
/** Below this natural width, zooming shows visible blur — hint for a better upload. */
const LOW_RES_WIDTH = 1200;

type Transform = { scale: number; tx: number; ty: number };

const IDENTITY: Transform = { scale: 1, tx: 0, ty: 0 };

function clampNum(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Keep the scaled content covering the viewport (no dragging fully out of view). */
function clampTransform(t: Transform, vw: number, vh: number): Transform {
  const scale = clampNum(t.scale, MIN_SCALE, MAX_SCALE);
  return {
    scale,
    tx: clampNum(t.tx, Math.min(0, vw - vw * scale), 0),
    ty: clampNum(t.ty, Math.min(0, vh - vh * scale), 0),
  };
}

export function FloorPlanViewer({
  imageUrl,
  pins,
  selectedPinId = null,
  mode = "view",
  onPlacePin,
  onSelectPin,
  draftPin = null,
  focusPoint = null,
  toolbarStart,
  className,
}: {
  imageUrl: string;
  pins: ViewerPin[];
  selectedPinId?: string | null;
  /** "place" turns clicks/taps into onPlacePin calls; "view" pans instead. */
  mode?: "view" | "place";
  onPlacePin?: (x: number, y: number) => void;
  onSelectPin?: (id: string) => void;
  /** Temporary pin shown while the Add Defect modal is open. */
  draftPin?: { x: number; y: number } | null;
  /**
   * When set, the viewer auto-centers on this point at ~2.5x on load and shows
   * "Focus on Defect" / "View Full Plan" controls (Sub-Con focused view).
   */
  focusPoint?: { x: number; y: number } | null;
  /** Extra controls rendered at the start of the toolbar (e.g. mode buttons). */
  toolbarStart?: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [lowRes, setLowRes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Natural aspect ratio (w/h) so fullscreen can letterbox without distortion.
  const [aspect, setAspect] = useState<number | null>(null);
  // Active pointers (mouse/touch) for pan + pinch, and total gesture movement
  // so we can tell a tap (place pin) apart from a drag (pan).
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const movedRef = useRef(0);
  // Max simultaneous pointers in the current gesture: a pinch that ends
  // motionless must never count as a tap.
  const gesturePointersRef = useRef(0);
  // Double-tap detection (touch) + suppressing the synthetic dblclick that
  // some mobile browsers fire after it (we already zoomed on the second tap).
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastPointerTypeRef = useRef<string>("mouse");

  const zoomAtPoint = useCallback((px: number, py: number, factor: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    setTransform((t) => {
      const scale = clampNum(t.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / t.scale;
      // Keep the point under (px,py) fixed while scaling.
      return clampTransform(
        { scale, tx: px - (px - t.tx) * k, ty: py - (py - t.ty) * k },
        vw,
        vh,
      );
    });
  }, []);

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      zoomAtPoint(vp.clientWidth / 2, vp.clientHeight / 2, factor);
    },
    [zoomAtPoint],
  );

  const resetView = useCallback(() => setTransform(IDENTITY), []);

  // Double-click / double-tap: step to the next whole zoom level (1→2→…→5),
  // keeping the clicked plan location under the pointer (same pointer-centered
  // math as wheel zoom). At max zoom it stays at max.
  const doubleClickZoomAt = useCallback((px: number, py: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    setTransform((t) => {
      const target = clampNum(
        Math.floor(t.scale + 0.001) + 1,
        MIN_SCALE,
        MAX_SCALE,
      );
      const k = target / t.scale;
      return clampTransform(
        { scale: target, tx: px - (px - t.tx) * k, ty: py - (py - t.ty) * k },
        vw,
        vh,
      );
    });
  }, []);

  // Base UI dialogs are portaled to document.body, which the browser hides
  // behind a fullscreen element. So before anything that opens a dialog
  // (select pin / place pin), leave fullscreen first, then run the callback.
  const runOutsideFullscreen = useCallback((fn: () => void) => {
    if (document.fullscreenElement) {
      document
        .exitFullscreen()
        .catch(() => {})
        .finally(fn);
    } else {
      fn();
    }
  }, []);

  function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (typeof root.requestFullscreen !== "function") {
      toast.error("Full screen is not supported by this browser.");
      return;
    }
    root.requestFullscreen().catch(() => {
      toast.error("Full screen is not supported by this browser.");
    });
  }

  // Track fullscreen state (covers Escape and browser-initiated exits) and
  // re-clamp the pan offset for the new viewport size.
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
      requestAnimationFrame(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        setTransform((t) => clampTransform(t, vp.clientWidth, vp.clientHeight));
      });
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const focusOn = useCallback((x: number, y: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!vw || !vh) return;
    setTransform(
      clampTransform(
        {
          scale: FOCUS_SCALE,
          tx: vw / 2 - x * vw * FOCUS_SCALE,
          ty: vh / 2 - y * vh * FOCUS_SCALE,
        },
        vw,
        vh,
      ),
    );
  }, []);

  // Auto-focus on the given point once the image has a measurable size.
  const focusX = focusPoint?.x;
  const focusY = focusPoint?.y;
  useEffect(() => {
    if (focusX === undefined || focusY === undefined || !imageLoaded) return;
    // rAF so the layout height from the freshly loaded image is applied first.
    const id = requestAnimationFrame(() => focusOn(focusX, focusY));
    return () => cancelAnimationFrame(id);
  }, [focusX, focusY, imageLoaded, focusOn]);

  // Mouse wheel zoom. Needs a non-passive listener to preventDefault page scroll.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomAtPoint(
        e.clientX - rect.left,
        e.clientY - rect.top,
        e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP,
      );
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAtPoint]);

  // Re-clamp the pan offset when the viewport resizes. Pin positions are % of
  // the content layer, so they never drift on resize.
  useEffect(() => {
    const onResize = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      setTransform((t) => clampTransform(t, vp.clientWidth, vp.clientHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const vp = viewportRef.current;
    if (!vp) return;
    vp.setPointerCapture(e.pointerId);
    const rect = vp.getBoundingClientRect();
    if (pointersRef.current.size === 0) {
      movedRef.current = 0;
      gesturePointersRef.current = 0;
      setDragging(true);
    }
    pointersRef.current.set(e.pointerId, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    gesturePointersRef.current = Math.max(
      gesturePointersRef.current,
      pointersRef.current.size,
    );
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const prev = pointersRef.current.get(e.pointerId);
    const vp = viewportRef.current;
    if (!prev || !vp) return;
    const rect = vp.getBoundingClientRect();
    const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (pointersRef.current.size === 2) {
      // Pinch zoom: scale by the change in finger distance, about the midpoint,
      // then pan by the midpoint movement.
      const entries = [...pointersRef.current.entries()];
      const other =
        entries[0][0] === e.pointerId ? entries[1][1] : entries[0][1];
      const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
      const newDist = Math.hypot(cur.x - other.x, cur.y - other.y);
      const prevMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      const newMid = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 };
      setTransform((t) => {
        const scale = clampNum(
          t.scale * (prevDist > 0 ? newDist / prevDist : 1),
          MIN_SCALE,
          MAX_SCALE,
        );
        const k = scale / t.scale;
        return clampTransform(
          {
            scale,
            tx: prevMid.x - (prevMid.x - t.tx) * k + (newMid.x - prevMid.x),
            ty: prevMid.y - (prevMid.y - t.ty) * k + (newMid.y - prevMid.y),
          },
          rect.width,
          rect.height,
        );
      });
      movedRef.current += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    } else {
      // Single pointer: pan.
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      movedRef.current += Math.hypot(dx, dy);
      setTransform((t) =>
        clampTransform(
          { ...t, tx: t.tx + dx, ty: t.ty + dy },
          rect.width,
          rect.height,
        ),
      );
    }
    pointersRef.current.set(e.pointerId, cur);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev) return;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) setDragging(false);
    lastPointerTypeRef.current = e.pointerType;

    // A clean tap: no drag, and the gesture never became a pinch.
    const isTap =
      pointersRef.current.size === 0 &&
      movedRef.current < TAP_SLOP_PX &&
      gesturePointersRef.current <= 1;
    if (!isTap) {
      lastTapRef.current = null;
      return;
    }
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (mode === "place" && onPlacePin) {
      // Place mode: a tap drops exactly one pin at the tapped image location,
      // converted back through the inverse transform. Never double-tap zoom.
      const x = clampNum((px - transform.tx) / transform.scale / rect.width, 0, 1);
      const y = clampNum((py - transform.ty) / transform.scale / rect.height, 0, 1);
      runOutsideFullscreen(() => onPlacePin(x, y));
    } else if (mode === "view" && e.pointerType === "touch") {
      // View mode double-tap (touch) zooms into the tapped spot.
      const last = lastTapRef.current;
      const now = Date.now();
      if (
        last &&
        now - last.time < DOUBLE_TAP_MS &&
        Math.hypot(px - last.x, py - last.y) < DOUBLE_TAP_SLOP_PX
      ) {
        lastTapRef.current = null;
        doubleClickZoomAt(px, py);
      } else {
        lastTapRef.current = { time: now, x: px, y: py };
      }
    }
  }

  // Desktop double-click zoom (view mode only). Touch double-taps are handled
  // in handlePointerUp; skip the synthetic dblclick some browsers fire after.
  function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "view" || lastPointerTypeRef.current === "touch") return;
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    doubleClickZoomAt(e.clientX - rect.left, e.clientY - rect.top);
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) setDragging(false);
  }

  const scalePct = Math.round(transform.scale * 100);

  return (
    <div
      ref={rootRef}
      // In browser fullscreen the root fills the screen: toolbar on top, dark
      // backdrop, drawing letterboxed in the remaining space.
      className={cn(
        isFullscreen
          ? "flex h-full w-full flex-col justify-center gap-2 overflow-hidden bg-neutral-950 p-3"
          : "space-y-2",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {toolbarStart}
        {focusPoint && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => focusOn(focusPoint.x, focusPoint.y)}
            >
              <Crosshair className="h-4 w-4" />
              Focus on Defect
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetView}>
              <Expand className="h-4 w-4" />
              View Full Plan
            </Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="Zoom out"
            aria-label="Zoom out"
            disabled={transform.scale <= MIN_SCALE}
            onClick={() => zoomAtCenter(1 / BUTTON_STEP)}
          >
            <ZoomOut />
          </Button>
          <span
            className={cn(
              "w-11 text-center text-xs tabular-nums",
              isFullscreen ? "text-neutral-300" : "text-muted-foreground",
            )}
          >
            {scalePct}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="Zoom in"
            aria-label="Zoom in"
            disabled={transform.scale >= MAX_SCALE}
            onClick={() => zoomAtCenter(BUTTON_STEP)}
          >
            <ZoomIn />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="Reset view"
            aria-label="Reset view"
            onClick={resetView}
          >
            <RotateCcw />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title={isFullscreen ? "Exit full screen" : "Enter full screen"}
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize /> : <Maximize />}
          </Button>
        </div>
      </div>

      {/* Viewport */}
      <div
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDoubleClick={handleDoubleClick}
        style={{
          // While zoomed or placing a pin, take over touch gestures so panning
          // does not scroll the page. At 1x view mode, let the page scroll.
          touchAction:
            mode === "place" || transform.scale > 1 ? "none" : "pan-y",
          // Fullscreen: cap the width so the drawing (h = w / aspect) fits the
          // screen height minus toolbar, preserving the aspect ratio. The
          // viewport still equals the unscaled image box, so all zoom/pan and
          // pin math stays valid.
          ...(isFullscreen && aspect
            ? {
                width: `min(100%, calc((100vh - 7rem) * ${aspect}))`,
                marginInline: "auto",
              }
            : {}),
        }}
        className={cn(
          "relative w-full overflow-hidden rounded-xl border bg-muted/30 select-none",
          mode === "place"
            ? "cursor-crosshair"
            : dragging
              ? "cursor-grabbing"
              : "cursor-grab",
        )}
      >
        {/* Content layer: image + pins transform together */}
        <div
          className="origin-top-left"
          style={{
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transition: dragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          <Image
            src={imageUrl}
            alt="Floor plan"
            width={1600}
            height={1200}
            className="pointer-events-none h-auto w-full"
            draggable={false}
            unoptimized
            priority
            onLoad={(e) => {
              const img = e.currentTarget;
              setLowRes(img.naturalWidth > 0 && img.naturalWidth < LOW_RES_WIDTH);
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setAspect(img.naturalWidth / img.naturalHeight);
              }
              setImageLoaded(true);
            }}
          />

          {pins.map((pin) => {
            const isSelected = pin.id === selectedPinId;
            const style: React.CSSProperties = {
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
              // Inverse scale keeps pins a constant on-screen size at any zoom.
              transform: `translate(-50%, -50%) scale(${1 / transform.scale})`,
            };
            const face = (
              <span className="relative block h-7 w-7">
                {isSelected && (
                  <>
                    <span
                      className={cn(
                        "absolute -inset-1.5 animate-ping rounded-full opacity-50",
                        pin.colorClass,
                      )}
                    />
                    <span className="absolute -inset-1.5 rounded-full ring-2 ring-primary" />
                  </>
                )}
                <span
                  className={cn(
                    "relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md ring-1 ring-black/20",
                    pin.colorClass,
                  )}
                >
                  {pin.label ?? <MapPin className="h-4 w-4" />}
                </span>
              </span>
            );
            // Pins are clickable in view mode only; in place mode they let
            // taps pass through so a new pin can be placed next to them.
            return onSelectPin && mode === "view" ? (
              <button
                key={pin.id}
                type="button"
                title={pin.title}
                style={style}
                className={cn(
                  "absolute focus:outline-none",
                  isSelected ? "z-20" : "z-10",
                )}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // Dialogs live outside the fullscreen element, so leave
                  // fullscreen before opening the defect detail.
                  runOutsideFullscreen(() => onSelectPin(pin.id));
                }}
              >
                {face}
              </button>
            ) : (
              <span
                key={pin.id}
                style={style}
                className={cn(
                  "pointer-events-none absolute",
                  isSelected ? "z-20" : "z-10",
                )}
              >
                {face}
              </span>
            );
          })}

          {/* Temporary pin while the Add Defect modal is open */}
          {draftPin && (
            <span
              style={{
                left: `${draftPin.x * 100}%`,
                top: `${draftPin.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${1 / transform.scale})`,
              }}
              className="pointer-events-none absolute z-30 block h-7 w-7"
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-md ring-1 ring-black/20">
                <Crosshair className="h-4 w-4" />
              </span>
            </span>
          )}
        </div>
      </div>

      {lowRes && (
        <p className="text-xs text-muted-foreground">
          For clearer zooming, upload a high-resolution floor plan.
        </p>
      )}
    </div>
  );
}
