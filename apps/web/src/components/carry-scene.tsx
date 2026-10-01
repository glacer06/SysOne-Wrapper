"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Plays the carry once, when the ruler is in view. The server renders it with `is-playing`, so
 * without JavaScript it plays once on load. If the scene starts off screen, the class comes off
 * (the end frame shows) and goes back on the first time it scrolls into view. No loops, no replays.
 */
export function CarryScene({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof IntersectionObserver === "undefined") return;
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;
    el.classList.remove("is-playing");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add("is-playing");
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="carry-scene is-playing">
      {children}
    </div>
  );
}
