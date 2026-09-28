import { parse } from "marked";
import sanitizeHtml from "sanitize-html";

export function markdownToHTML(markdown: string) {
  const html = parse(markdown);
  // Allow only a super restricted set of tags and attributes. The plugin market
  // renders plugin READMEs with the same list (EPanel_Market server/utils/markdown.ts);
  // change both together.
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
