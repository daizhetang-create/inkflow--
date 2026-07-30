"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type OpeningPhase =
  | "loading"
  | "intro"
  | "awaiting-entry"
  | "transition"
  | "complete";

const SESSION_KEY = "inkflow:opening-complete";
const LOAD_FALLBACK_MS = 3000;
const TRANSITION_FADE_SECONDS = 0.3;
const REDUCED_MOTION_FADE_MS = 320;

const openingStatus: Record<OpeningPhase, string> = {
  loading: "\u6b63\u5728\u51c6\u5907\u58a8\u6d41\u5f00\u573a",
  intro: "\u58a8\u6d41\u5f00\u573a\u6b63\u5728\u64ad\u653e",
  "awaiting-entry": "\u5f00\u573a\u64ad\u653e\u5b8c\u6bd5\uff0c\u53ef\u4ee5\u8fdb\u5165\u58a8\u6d41",
  transition: "\u6b63\u5728\u8fdb\u5165\u58a8\u6d41",
  complete: "\u5df2\u8fdb\u5165\u58a8\u6d41",
};

export function InkflowOpening({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<OpeningPhase>("loading");
  const [isFading, setIsFading] = useState(false);
  const introRef = useRef<HTMLVideoElement>(null);
  const transitionRef = useRef<HTMLVideoElement>(null);
  const entryRef = useRef<HTMLButtonElement>(null);
  const appContentRef = useRef<HTMLDivElement>(null);
  const loadFallbackTimerRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const introStartedRef = useRef(false);
  const transitionStartedRef = useRef(false);
  const transitionFailedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const fallbackActivatedRef = useRef(false);
  const completedRef = useRef(false);

  const clearLoadFallback = useCallback(() => {
    if (loadFallbackTimerRef.current !== null) {
      window.clearTimeout(loadFallbackTimerRef.current);
      loadFallbackTimerRef.current = null;
    }
  }, []);

  const completeOpening = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearLoadFallback();

    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Storage can be unavailable in hardened/private browsing contexts.
    }

    setPhase("complete");
    window.requestAnimationFrame(() => {
      appContentRef.current?.focus({ preventScroll: true });
    });
  }, [clearLoadFallback]);

  const showStaticFallback = useCallback(() => {
    if (completedRef.current || transitionStartedRef.current) return;
    fallbackActivatedRef.current = true;
    clearLoadFallback();
    introRef.current?.pause();
    setPhase("awaiting-entry");
  }, [clearLoadFallback]);

  useEffect(() => {
    let cancelled = false;
    const forcePreview = new URLSearchParams(window.location.search).get("intro") === "1";
    let hasCompleted = false;

    try {
      hasCompleted = window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // Treat unavailable storage as a fresh session.
    }

    if (hasCompleted && !forcePreview) {
      completeOpening();
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedMotionRef.current = reducedMotion;
    if (reducedMotion) {
      setPhase("awaiting-entry");
      return;
    }

    const intro = introRef.current;
    const transition = transitionRef.current;
    if (!intro || !transition) {
      showStaticFallback();
      return;
    }

    intro.load();
    transition.load();

    const startIntro = async () => {
      if (
        cancelled ||
        introStartedRef.current ||
        completedRef.current ||
        fallbackActivatedRef.current
      ) return;
      introStartedRef.current = true;
      intro.currentTime = 0;

      try {
        await intro.play();
        if (cancelled || completedRef.current || fallbackActivatedRef.current) return;
        clearLoadFallback();
        setPhase("intro");
      } catch {
        showStaticFallback();
      }
    };

    loadFallbackTimerRef.current = window.setTimeout(showStaticFallback, LOAD_FALLBACK_MS);

    if (intro.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      void startIntro();
    } else {
      intro.addEventListener("canplay", startIntro, { once: true });
    }

    return () => {
      cancelled = true;
      intro.removeEventListener("canplay", startIntro);
      clearLoadFallback();
    };
  }, [clearLoadFallback, completeOpening, showStaticFallback]);

  const openingActive = phase !== "complete";

  useEffect(() => {
    if (!openingActive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [openingActive]);

  useEffect(() => {
    if (phase !== "awaiting-entry") return;
    window.requestAnimationFrame(() => entryRef.current?.focus({ preventScroll: true }));
  }, [phase]);

  useEffect(
    () => () => {
      clearLoadFallback();
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
    },
    [clearLoadFallback],
  );

  const finishWithoutMotion = useCallback(() => {
    setPhase("transition");
    setIsFading(true);
    completionTimerRef.current = window.setTimeout(completeOpening, REDUCED_MOTION_FADE_MS);
  }, [completeOpening]);

  const enterInkflow = useCallback(async () => {
    if (phase !== "awaiting-entry" || transitionStartedRef.current) return;
    transitionStartedRef.current = true;

    if (reducedMotionRef.current || transitionFailedRef.current) {
      finishWithoutMotion();
      return;
    }

    const transition = transitionRef.current;
    if (!transition) {
      finishWithoutMotion();
      return;
    }

    transition.currentTime = 0;
    setPhase("transition");
    try {
      await transition.play();
    } catch {
      finishWithoutMotion();
    }
  }, [finishWithoutMotion, phase]);

  const handleTransitionProgress = useCallback(() => {
    const transition = transitionRef.current;
    if (!transition || !Number.isFinite(transition.duration)) return;
    if (transition.duration - transition.currentTime <= TRANSITION_FADE_SECONDS) {
      setIsFading(true);
    }
  }, []);

  const handleTransitionError = useCallback(() => {
    transitionFailedRef.current = true;
    if (transitionStartedRef.current) finishWithoutMotion();
  }, [finishWithoutMotion]);

  return (
    <>
      <div
        ref={appContentRef}
        className="inkflow-page-content"
        aria-hidden={openingActive ? true : undefined}
        inert={openingActive ? true : undefined}
        tabIndex={-1}
      >
        {children}
      </div>

      {openingActive ? (
        <section
          className={`inkflow-opening${isFading ? " is-fading" : ""}`}
          data-opening-phase={phase}
          aria-label={"\u58a8\u6d41\u5f00\u573a"}
          aria-modal="true"
          role="dialog"
        >
          <p className="sr-only" role="status" aria-live="polite">
            {openingStatus[phase]}
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element -- Preserve the authored end frame exactly. */}
          <img
            className={`inkflow-opening__poster${
              phase === "awaiting-entry" || phase === "transition" ? " is-visible" : ""
            }`}
            src="/inkflow-opening/end-frame.png"
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchPriority="high"
          />

          <video
            ref={introRef}
            className={`inkflow-opening__video${phase === "intro" ? " is-visible" : ""}`}
            src="/inkflow-opening/intro.mp4"
            muted
            playsInline
            preload="auto"
            controls={false}
            disablePictureInPicture
            onPlaying={() => {
              clearLoadFallback();
              setPhase((current) => (current === "loading" ? "intro" : current));
            }}
            onEnded={() => setPhase("awaiting-entry")}
            onError={showStaticFallback}
          />

          <video
            ref={transitionRef}
            className={`inkflow-opening__video inkflow-opening__video--transition${
              phase === "transition" ? " is-visible" : ""
            }`}
            src="/inkflow-opening/click-transition.mp4"
            muted
            playsInline
            preload="auto"
            controls={false}
            disablePictureInPicture
            onTimeUpdate={handleTransitionProgress}
            onEnded={completeOpening}
            onError={handleTransitionError}
          />

          {phase === "awaiting-entry" ? (
            <button
              ref={entryRef}
              className="inkflow-opening__entry"
              type="button"
              aria-label={"\u8fdb\u5165\u58a8\u6d41"}
              onClick={() => void enterInkflow()}
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}
