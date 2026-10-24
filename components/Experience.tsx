"use client";

// The experience around every page: the world behind it (components/World.tsx), an intro to step
// into, the site's sound (lib/experience/sound.ts) with its corner button, soft sounds on hover and
// click, and a cursor ring on desktop. The intro shows once per tab. After a reload the sound comes
// back on the first tap or key, since browsers allow sound only after a gesture.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { clickSound, hoverSound, isSoundOn, onSoundChange, setSoundOn, startSound } from "@/lib/experience/sound";

const World = dynamic(() => import("./World"), { ssr: false });

const ENTERED_KEY = "entered";
const LEAVE_MS = 950;
const INTERACTIVE = "a, button, summary, [role='button'], label.btn, input[type='checkbox']";

const WORDS = {
  en: { name: "Is it an e-bike?", line: "Check one bike for one rider, with the law behind every answer. Then plan a legal route.", enter: "Enter", foot: "Sound on", sound: "Sound" },
  es: { name: "¿Es una bicicleta eléctrica?", line: "Revisa una bicicleta para un ciclista, con la ley detrás de cada respuesta. Luego planea una ruta legal.", enter: "Entrar", foot: "Con sonido", sound: "Sonido" },
};

function readEntered(): boolean {
  try {
    return window.sessionStorage.getItem(ENTERED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveEntered(): void {
  try {
    window.sessionStorage.setItem(ENTERED_KEY, "1");
  } catch {
    // Storage refused. The intro then shows again on the next page.
  }
}

/** A wheel that draws itself in and turns, the site's mark. */
function WheelMark() {
  const spokes = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 8);
  return (
    <svg viewBox="0 0 120 120" className="intro-wheel" aria-hidden="true">
      <circle cx="60" cy="60" r="52" className="intro-rim" />
      <circle cx="60" cy="60" r="44" className="intro-rim intro-rim-in" />
      {spokes.map((a) => (
        <line key={a} x1={60 + Math.cos(a) * 44} y1={60 + Math.sin(a) * 44} x2={60 - Math.cos(a) * 44} y2={60 - Math.sin(a) * 44} className="intro-spoke" />
      ))}
      <circle cx="60" cy="60" r="7" className="intro-hub" />
    </svg>
  );
}

export function Experience() {
  const lang = document.documentElement.lang === "es" ? "es" : "en";
  const w = WORDS[lang];
  const [entered, setEntered] = useState(readEntered);
  const [leaving, setLeaving] = useState(false);
  const [soundOn, setOn] = useState(isSoundOn);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => onSoundChange(setOn), []);

  // While the intro is up, the page behind it can't be reached by keyboard or screen reader.
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    main.inert = !entered;
    return () => {
      main.inert = false;
    };
  }, [entered]);

  // After a reload the sound starts again on the first gesture, unless it was turned off.
  useEffect(() => {
    if (!entered) return;
    const wake = () => {
      try {
        if (window.sessionStorage.getItem("sound-muted") !== "1") startSound();
      } catch {
        startSound();
      }
    };
    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [entered]);

  // Soft sounds on hover and click, and the cursor ring, on mouse-driven screens.
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last: Element | null = null;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const hit = (e.target as Element | null)?.closest(INTERACTIVE) ?? null;
      if (hit && hit !== last) hoverSound();
      last = hit;
      ring.current?.setAttribute("data-hover", hit ? "true" : "false");
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest(INTERACTIVE)) clickSound();
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("click", onClick, true);

    let raf = 0;
    const pos = { x: -100, y: -100, tx: -100, ty: -100 };
    const onMove = (e: PointerEvent) => {
      pos.tx = e.clientX;
      pos.ty = e.clientY;
      ring.current?.setAttribute("data-on", "true");
    };
    const onLeave = () => ring.current?.setAttribute("data-on", "false");
    const follow = () => {
      raf = requestAnimationFrame(follow);
      const ease = still ? 1 : 0.18;
      pos.x += (pos.tx - pos.x) * ease;
      pos.y += (pos.ty - pos.y) * ease;
      if (ring.current) ring.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    };
    if (fine) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      follow();
    }
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  function enter() {
    if (leaving) return;
    setSoundOn(true);
    setLeaving(true);
    saveEntered();
    window.setTimeout(() => setEntered(true), LEAVE_MS);
  }

  function toggleSound() {
    setSoundOn(!soundOn);
  }

  return (
    <>
      <World />
      {!entered ? (
        <div
          className="intro"
          data-leaving={leaving}
          role="dialog"
          aria-modal="true"
          aria-label={w.name}
          onKeyDown={(e) => {
            if (e.key === "Escape") enter();
          }}
        >
          <div className="intro-body">
            <WheelMark />
            <p className="intro-name">{w.name}</p>
            <p className="intro-line">{w.line}</p>
            {/* The one control on the intro, so it takes focus. */}
            <button type="button" className="intro-enter" onClick={enter} autoFocus>
              {w.enter}
              <span aria-hidden="true">↓</span>
            </button>
          </div>
          <p className="intro-foot">{w.foot}</p>
        </div>
      ) : null}
      <button type="button" className="sound-btn no-print" aria-pressed={soundOn} aria-label={w.sound} onClick={toggleSound}>
        <span className="sound-bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </button>
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
    </>
  );
}
