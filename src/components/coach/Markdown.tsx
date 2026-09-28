/**
 * Just enough Markdown for chat replies: paragraphs, bullet/numbered lists, headings,
 * **bold**, *italic* and `code`. Builds React elements (never raw HTML), so model output
 * can't inject markup.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {items.map((item, k) => (
            <li key={k}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={blocks.length} className="list-decimal space-y-1 pl-5">
          {items.map((item, k) => (
            <li key={k}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push(
        <p key={blocks.length} className="font-semibold">
          {inline(line.replace(/^#{1,6}\s+/, ""))}
        </p>,
      );
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)]|#{1,6})\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={blocks.length}>
        {para.map((l, k) => (
          <span key={k}>
            {k > 0 && <br />}
            {inline(l)}
          </span>
        ))}
      </p>,
    );
  }
  return <div className="space-y-2.5 leading-relaxed">{blocks}</div>;
}

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-surface-2 px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    if (((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}
