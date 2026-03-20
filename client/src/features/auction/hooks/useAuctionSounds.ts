import { useCallback, useRef, useState } from 'react';

/**
 * Web Audio API sound effects for the auction.
 * Uses oscillator tones — no mp3 files needed.
 * AudioContext is lazily created on first user interaction (browser autoplay policy).
 */
export function useAuctionSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('auctionMuted') === 'true';
  });

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playTone = useCallback((
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.15
  ) => {
    if (isMuted) return;
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = volume;
      // Fade out to avoid click
      gain.gain.setTargetAtTime(0, ctx.currentTime + duration * 0.7, duration * 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Ignore audio errors (e.g., no audio device)
    }
  }, [isMuted, getCtx]);

  // New nomination — bright ding
  const playNomination = useCallback(() => {
    playTone(880, 0.15, 'sine', 0.12);
  }, [playTone]);

  // You were outbid — alert
  const playOutbid = useCallback(() => {
    playTone(440, 0.12, 'triangle', 0.15);
    setTimeout(() => playTone(550, 0.15, 'triangle', 0.12), 120);
  }, [playTone]);

  // Your turn to nominate — attention
  const playYourTurn = useCallback(() => {
    playTone(660, 0.1, 'sine', 0.12);
    setTimeout(() => playTone(880, 0.15, 'sine', 0.15), 120);
  }, [playTone]);

  // You won a player — celebration arpeggio
  const playWin = useCallback(() => {
    playTone(523, 0.12, 'sine', 0.1);
    setTimeout(() => playTone(659, 0.12, 'sine', 0.1), 100);
    setTimeout(() => playTone(784, 0.2, 'sine', 0.12), 200);
  }, [playTone]);

  // Timer critical tick (<5s)
  const playTick = useCallback(() => {
    playTone(1000, 0.04, 'square', 0.06);
  }, [playTone]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      localStorage.setItem('auctionMuted', String(next));
      // If unmuting, ensure AudioContext is ready
      if (!next) getCtx();
      return next;
    });
  }, [getCtx]);

  return {
    playNomination,
    playOutbid,
    playYourTurn,
    playWin,
    playTick,
    isMuted,
    toggleMute,
  };
}
