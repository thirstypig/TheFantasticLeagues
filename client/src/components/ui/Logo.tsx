import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * TFL logo — baseball emoji placeholder.
 * Will be replaced with a custom multi-sport logo in the future.
 */
export function Logo({ size = 40, className = "" }: LogoProps) {
  return (
    <span
      className={className}
      style={{ fontSize: size * 0.85, lineHeight: 1, display: "inline-block", width: size, height: size, textAlign: "center" }}
      role="img"
      aria-label="TFL Logo"
    >
      &#x26BE;
    </span>
  );
}
