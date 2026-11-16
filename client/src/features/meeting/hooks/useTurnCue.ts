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
    void ctx.resume?.();
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      try {
        void ctx.close?.()?.catch?.(() => {});
      } catch {
        /* already closed */
      }
    };
    osc.onended = close;
    timer = setTimeout(close, 1000); // fallback so a context can't leak if onended never fires
  } catch {
    /* no sound is fine */
  }
}

/**
 * The "you're up" cue, keyed on the turn (`${round}.${turnIndex}` while it is my
 * turn and running, else null). The tab title shows while the key is set; one
 * tone plays when the key changes to a new turn after a ready state was seen.
 * `ready` means both the meeting and my team are known, so a late-resolving
 * league context can't read as a flip. Pause/resume keeps the key, no replay.
 */
export function useTurnCue(ready: boolean, turnKey: string | null): void {
  const seen = useRef(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (seen.current && turnKey !== null && turnKey !== last.current) playTone();
    if (turnKey !== null) last.current = turnKey;
    seen.current = true;
  }, [ready, turnKey]);

  useEffect(() => {
    if (turnKey === null) return;
    const original = document.title;
    document.title = TITLE;
    return () => {
      document.title = original;
    };
  }, [turnKey]);
}
