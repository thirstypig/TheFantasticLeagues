import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="my-3 rounded-lg overflow-hidden border border-[var(--lg-border-subtle)] shadow-sm">
      <img src={src} alt={alt} className="w-full" loading="lazy" width={1280} height={800} style={{ aspectRatio: "16 / 10" }} />
      {caption && <figcaption className="text-[10px] text-[var(--lg-text-muted)] text-center py-1.5 bg-[var(--lg-tint)] border-t border-[var(--lg-border-subtle)]">{caption}</figcaption>}
    </figure>
  );
}

export function Section({ title, icon: Icon, defaultOpen, children }: { title: string; icon: React.ElementType; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-[var(--lg-border-subtle)] rounded-xl overflow-hidden print:border-none">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-[var(--lg-tint)] hover:bg-[var(--lg-tint-hover)] transition-colors text-left print:bg-transparent print:px-0 print:py-2"
      >
        <Icon size={18} className="text-[var(--lg-accent)] shrink-0 print:hidden" />
        <span className="font-semibold text-[var(--lg-text-heading)] flex-1 text-sm">{title}</span>
        <ChevronDown size={14} className={`text-[var(--lg-text-muted)] transition-transform print:hidden ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 py-4 space-y-3 text-sm text-[var(--lg-text-secondary)] leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200 print:px-0">
          {children}
        </div>
      )}
    </div>
  );
}

export function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-[var(--lg-accent)] text-white flex items-center justify-center text-[10px] font-bold print:bg-gray-800">{num}</div>
      <div className="flex-1">
        <div className="font-semibold text-[var(--lg-text-primary)] text-sm mb-0.5">{title}</div>
        <div className="text-[var(--lg-text-secondary)] text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 px-3 py-2 rounded-lg bg-[var(--lg-accent)]/5 border border-[var(--lg-accent)]/20 text-sm print:bg-gray-50 print:border-gray-200">
      <span className="shrink-0 font-semibold text-[var(--lg-accent)]">Tip:</span>
      <span>{children}</span>
    </div>
  );
}

export function GuideHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-[var(--lg-text-heading)]">{title}</h1>
        <p className="text-sm text-[var(--lg-text-muted)] mt-1">{subtitle}</p>
      </div>
      <button
        onClick={() => window.print()}
        className="print:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint-hover)] transition-colors"
        title="Print or save as PDF"
      >
        Print / PDF
      </button>
    </div>
  );
}
