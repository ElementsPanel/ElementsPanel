import { parse } from "marked";
import sanitizeHtml from "sanitize-html";

export function markdownToHTML(markdown: string) {
  const html = parse(markdown);
  // Keep README sanitization rules aligned with the market server.
  const safeHtml = sanitizeHtml(html, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "b",
      "i",
      "em",
      "strong",
      "a",
      "p",
      "table",
      "thead",
      "ul",
      "ol",
      "li",
      "img",
      "pre",
      "blockquote",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "br",
      "code",
      "font"
    ],
    allowedAttributes: {
      a: ["href", "target"],
      img: ["height", "width", "src", "alt"]
    }
  });
  return safeHtml;
}
