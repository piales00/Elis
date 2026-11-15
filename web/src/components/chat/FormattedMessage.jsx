import React from "react";

function renderInlineFormatting(text) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`b-${idx++}`} className="font-bold text-fg">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <span
          key={`i-${idx++}`}
          className="rounded border border-line bg-bg/80 px-1 py-0.2 font-mono text-[11.5px] font-semibold text-est"
        >
          {token.slice(1, -1)}
        </span>,
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function detectAlertBadge(text, isEs = false) {
  const raw = String(text || "");
  if (/(very_high|VERY HIGH|muy alta|cr[ií]tica)/i.test(raw)) {
    return {
      label: isEs ? "CLASE MUY ALTA" : "VERY HIGH CLASS",
      cls: "border-danger/50 bg-danger/15 text-danger",
    };
  }
  if (/(HIGH ALERT|alerta alta|\bhigh class\b|categor[ií]a alta)/i.test(raw)) {
    return {
      label: isEs ? "CLASE ALTA" : "HIGH CLASS",
      cls: "border-forecast/50 bg-forecast/15 text-forecast",
    };
  }
  if (/(normal class|categor[ií]a normal|niveles normales|NORMAL \/ MODERATE)/i.test(raw)) {
    return {
      label: isEs ? "CLASE NORMAL" : "NORMAL CLASS",
      cls: "border-est/40 bg-est/10 text-est",
    };
  }
  return null;
}

export default function FormattedMessage({ content, compact = false }) {
  if (!content) return null;
  const lines = String(content)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className={compact ? "space-y-1.5 text-xs" : "space-y-2 text-sm"}>
      {lines.map((line, i) => {
        const cleanLine = line.replace(/^[•\-]\s*/, "");
        const isAction = /^(🛡️|👉)/.test(cleanLine);
        const isFinding = /^(🚨|📌|🎯)/.test(cleanLine);

        if (isAction) {
          return (
            <div
              key={i}
              className="rounded-xl border border-forecast/30 bg-forecast/10 px-2.5 py-1.5 leading-relaxed text-fg"
            >
              {renderInlineFormatting(cleanLine)}
            </div>
          );
        }

        if (isFinding) {
          return (
            <div
              key={i}
              className="rounded-xl border border-line bg-bg/60 px-2.5 py-1.5 leading-relaxed text-fg"
            >
              {renderInlineFormatting(cleanLine)}
            </div>
          );
        }

        return (
          <p key={i} className="m-0 leading-relaxed text-fg">
            {renderInlineFormatting(line)}
          </p>
        );
      })}
    </div>
  );
}
