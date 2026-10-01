"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Draws a BWireframe's trail in once, when it first scrolls into view. The rest state is the
 * finished drawing: without JavaScript, with reduced motion, or when it is already on screen at
 * load, nothing moves. No loops.
 */
export function DrawOnView({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"rest" | "pending" | "drawn">("rest");

  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;
    setState("pending");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          requestAnimationFrame(() => setState("drawn"));
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} data-draw={state}>
      {children}
    </div>
  );
}
