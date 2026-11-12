/**
 * Markdown from users (e.g. project descriptions), rendered as React elements with a fixed
 * allowlist (decision 2026-11-12). No raw HTML (skipped), no images (no requests to other
 * servers), links only to http(s) and mailto, always marked as user content. Never uses
 * innerHTML, so the ESLint ban on dangerouslySetInnerHTML stays intact.
 */
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./Markdown.module.css";

const ALLOWED_ELEMENTS = [
  "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "hr",
  "em", "strong", "del", "code", "pre", "a", "table", "thead", "tbody", "tr", "th", "td",
];

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

export function safeMarkdownUrl(url: string): string | null {
  return SAFE_URL.test(url.trim()) ? url : null;
}

// Headings start below the page title (h1) of the surrounding page.
function shifted(level: number) {
  const Tag = `h${Math.min(level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
  return function Heading(props: ComponentProps<"h2">) {
    return <Tag className={styles.heading}>{props.children}</Tag>;
  };
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        urlTransform={(url) => safeMarkdownUrl(url) ?? ""}
        components={{
          h1: shifted(1),
          h2: shifted(2),
          h3: shifted(3),
          h4: shifted(4),
          h5: shifted(5),
          h6: shifted(6),
          a: ({ href, children }) =>
            href ? (
              <a href={href} rel="nofollow ugc noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
