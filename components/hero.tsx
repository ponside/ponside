"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { AbstractBackground } from "@/components/abstract-background";
import { EarlyAccessButton } from "@/components/early-access-button";
import { FollowXButton } from "@/components/follow-x-button";

const LETTERS = ["P", "O", "N", "S", "I", "D", "E"];

export function Hero() {
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    const target = event.currentTarget;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      target.style.setProperty("--pointer-x", `${x}%`);
      target.style.setProperty("--pointer-y", `${y}%`);
      target.style.setProperty("--drift-x", `${(x - 50) * 0.065}px`);
      target.style.setProperty("--drift-y", `${(y - 50) * 0.05}px`);
    });
  }, []);

  return (
    <main className="hero" onPointerMove={handlePointerMove}>
      <AbstractBackground />

      <section className="hero-content" aria-labelledby="ponside-title">
        <div className="wordmark-wrap">
          <h1 id="ponside-title" className="wordmark" aria-label="Ponside">
            {LETTERS.map((letter, index) => (
              <span
                aria-hidden="true"
                className={letter === "I" ? "wordmark-accent" : undefined}
                key={`${letter}-${index}`}
              >
                {letter}
              </span>
            ))}
          </h1>
          <span className="wordmark-rule" aria-hidden="true" />
        </div>

        <p className="coming-soon">Coming soon</p>
        <div className="cta-wrap">
          <EarlyAccessButton />
          <FollowXButton />
        </div>
      </section>
    </main>
  );
}
