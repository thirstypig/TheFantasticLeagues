import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// CI runners are shared and slow under load; RTL's 1000ms default async
// timeout intermittently expires mid-cascade (tab click -> select change ->
// fetch -> rerender), producing "Unable to find an element" flakes that pass
// locally (precedent: Home.test.tsx x2, ArchivePage.test.tsx x1, June 9-10).
// waitFor/findBy* POLL, so raising the ceiling never slows a passing test.
configure({ asyncUtilTimeout: 4000 });

// jsdom polyfills for `@tanstack/react-virtual` — without these the
// virtualizer reads zero-sized rects and renders no virtual items, so
// tests would see an empty list. Production browsers always have these.

// 1. ResizeObserver — virtualizer subscribes to scroll-element resizes.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

// 2. Sized scroll viewport — jsdom returns 0 for getBoundingClientRect,
//    clientWidth, clientHeight, offsetWidth, offsetHeight. The
//    virtualizer reads these via observeElementRect / observeElementOffset
//    and skips rendering if the element has no height. We synthesize
//    sane defaults so virtualization tests work end-to-end.
const SYNTHETIC_RECT: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 360,
  bottom: 600,
  width: 360,
  height: 600,
  toJSON() { return this; },
};

const originalGBCR = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  const rect = originalGBCR.call(this);
  if (rect.width === 0 && rect.height === 0) return SYNTHETIC_RECT;
  return rect;
};

// Patch clientWidth/clientHeight/offsetWidth/offsetHeight to non-zero
// when underlying values are zero. These are read-only getters in jsdom,
// so we redefine them with a fallback chain.
function patchSize(prop: "clientWidth" | "clientHeight" | "offsetWidth" | "offsetHeight", fallback: number): void {
  const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  if (!desc) return;
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get(this: HTMLElement) {
      const v = desc.get?.call(this) ?? 0;
      return v > 0 ? v : fallback;
    },
  });
}
patchSize("clientWidth", 360);
patchSize("clientHeight", 600);
patchSize("offsetWidth", 360);
patchSize("offsetHeight", 600);
