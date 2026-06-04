import { useEffect } from "react";

interface AdUnitProps {
  // TODO: replace with real 10-digit slot ID from AdSense dashboard
  // (AdSense → Ads → By ad unit → create Display ad → copy data-ad-slot)
  slot: string;
  format?: "auto" | "rectangle" | "horizontal";
  style?: React.CSSProperties;
}

export default function AdUnit({ slot, format = "auto", style }: AdUnitProps) {
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      // AdSense not loaded (adblocker or pending approval) — fail silently
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block", overflow: "hidden", ...style }}
      data-ad-client="ca-pub-7103672049879516"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
