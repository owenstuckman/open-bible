import { memo } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { parseRef, refHref } from "@/lib/bible/refs";

// [[Jn 3:16]] → a link to that verse. Unparseable refs are left as typed.
function linkVerseRefs(md: string): string {
  return md.replace(/\[\[([^\]\n]{2,40})\]\]/g, (whole, inner: string) => {
    const ref = parseRef(inner);
    return ref ? `[${inner}](${refHref(ref)})` : whole;
  });
}

// Module-level so element types stay stable across renders (an inline object
// would remount every link on each re-render, swallowing clicks).
const components: Components = {
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Link href={href} className="verse-link">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
};
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSanitize];

export const Markdown = memo(function Markdown({ source }: { source: string }) {
  return (
    <div className="note-md">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {linkVerseRefs(source)}
      </ReactMarkdown>
    </div>
  );
});
