import { useEffect, useRef } from "react";

const TITLE = "You're up · Meeting";

/** One short tone. WebAudio can be missing or blocked (autoplay policy), so it never throws. */
function playTone(): void {
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close?.();
  } catch {
    /* no sound is fine */
  }
}

/**
 * The "you're up" cue: the tab title while it is my turn, and one tone when a
 * poll flips to my turn. No tone on the first loaded state (a reload mid-turn).
 */
export function useTurnCue(ready: boolean, myTurn: boolean): void {
  const prev = useRef<boolean | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (prev.current === false && myTurn) playTone();
    prev.current = myTurn;
  }, [ready, myTurn]);

  useEffect(() => {
    if (!myTurn) return;
    const original = document.title;
    document.title = TITLE;
    return () => {
      document.title = original;
    };
  }, [myTurn]);
}
