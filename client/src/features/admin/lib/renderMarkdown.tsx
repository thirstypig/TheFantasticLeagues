import React from "react";

function inlineRender(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/);
  return parts.map((part, pi) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={pi}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={pi} className="rounded bg-[var(--lg-tint)] px-1 py-0.5 font-mono text-[11px] text-[var(--lg-accent)]">{part.slice(1, -1)}</code>;
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch)
      return <a key={pi} href={linkMatch[2]} className="text-[var(--lg-accent)] underline underline-offset-2" target="_blank" rel="noreferrer">{linkMatch[1]}</a>;
    return part;
  });
}

export function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="my-6 border-[var(--lg-border-faint)]" />);
      i++; continue;
    }

    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2];
      const Tag = `h${level}` as "h1"|"h2"|"h3"|"h4"|"h5"|"h6";
      const cls = [
        "font-bold text-[var(--lg-text-primary)]",
        level === 1 ? "text-2xl mt-8 mb-3" :
        level === 2 ? "text-lg mt-7 mb-2 border-b border-[var(--lg-border-faint)] pb-1" :
        level === 3 ? "text-base mt-5 mb-2" :
        "text-sm mt-4 mb-1",
      ].join(" ");
      nodes.push(<Tag key={key++} className={cls}>{inlineRender(text)}</Tag>);
      i++; continue;
    }

    if (line.startsWith(">")) {
      const content = line.replace(/^>\s*/, "");
      nodes.push(
        <blockquote key={key++} className="border-l-4 border-[var(--lg-accent)] bg-[var(--lg-tint)]/50 px-4 py-2 my-2 text-xs text-[var(--lg-text-muted)] italic">
          {inlineRender(content)}
        </blockquote>
      );
      i++; continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={key++} className="my-3 rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)] p-3 overflow-x-auto text-[11px] font-mono text-[var(--lg-text-primary)] leading-relaxed">
          {codeLines.join("\n")}
        </pre>
      );
      i++; continue;
    }

    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const headerCells = tableLines[0].split("|").filter(Boolean).map(c => c.trim());
        const bodyRows = tableLines.slice(2).map(row =>
          row.split("|").filter(Boolean).map(c => c.trim())
        );
        nodes.push(
          <div key={key++} className="my-4 overflow-x-auto rounded border border-[var(--lg-border-faint)]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--lg-tint)]">
                  {headerCells.map((h, hi) => (
                    <th key={hi} className="px-3 py-2 text-left font-semibold text-[var(--lg-text-primary)] border-b border-[var(--lg-border-faint)] whitespace-nowrap">
                      {inlineRender(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "" : "bg-[var(--lg-tint)]/30"}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-[var(--lg-text-primary)] border-b border-[var(--lg-border-faint)]/50 whitespace-nowrap">
                        {inlineRender(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={key++} className="my-2 list-disc list-inside space-y-0.5 text-sm text-[var(--lg-text-primary)]">
          {listItems.map((item, ii) => (
            <li key={ii} className="text-sm">{inlineRender(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    nodes.push(
      <p key={key++} className="my-2 text-sm leading-relaxed text-[var(--lg-text-primary)]">
        {inlineRender(line)}
      </p>
    );
    i++;
  }

  return nodes;
}
