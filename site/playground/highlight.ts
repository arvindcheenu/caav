/** A small highlighter for the JavaScript and shell on these pages. It returns HTML, one string per line. */

const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|const|let|function|return|if|else|new|true|false|null)\b|\b(\d+(?:\.\d+)?)\b/g;

const CLASSES = ["c-comment", "c-string", "c-keyword", "c-number"];

export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightLine(line: string) {
  let html = "";
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    html += escapeHtml(line.slice(last, match.index));
    const group = match.slice(1).findIndex((part) => part !== undefined);
    html += `<span class="${CLASSES[group]}">${escapeHtml(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return html + escapeHtml(line.slice(last));
}

export function highlightLines(code: string): string[] {
  return code.split("\n").map(highlightLine);
}
