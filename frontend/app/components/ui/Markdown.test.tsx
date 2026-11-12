import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown, safeMarkdownUrl } from "./Markdown";

const render = (markdown: string) => renderToStaticMarkup(<Markdown>{markdown}</Markdown>);

describe("Markdown", () => {
  it("renders the allowed basics and shifts headings below the page title", () => {
    const html = render("# Title\n\nSome **bold** text.\n\n- one\n- two\n\n`code`");
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<code>code</code>");
  });

  it("drops raw HTML, scripts and event handlers", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<b onclick="x()">hi</b>');
    expect(html).not.toMatch(/<script|<img|onerror|onclick|<b /i);
  });

  it("never renders images, also not via Markdown syntax", () => {
    expect(render("![tracker](https://tracker.example/pixel.png)")).not.toContain("<img");
  });

  it("keeps only http(s) and mailto links and marks them as user content", () => {
    const html = render("[ok](https://example.test) [bad](javascript:alert(1)) [data](data:text/html,x) [mail](mailto:a@example.test)");
    expect(html).toContain('href="https://example.test"');
    expect(html).toContain('href="mailto:a@example.test"');
    expect(html).not.toMatch(/javascript:|data:text/);
    expect(html).toContain('rel="nofollow ugc noopener noreferrer"');
  });
});

describe("safeMarkdownUrl", () => {
  it("allows only absolute http(s) and mailto", () => {
    expect(safeMarkdownUrl("https://example.test/a")).toBe("https://example.test/a");
    expect(safeMarkdownUrl("mailto:x@example.test")).toBe("mailto:x@example.test");
    for (const url of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "/relative", "vbscript:x"]) {
      expect(safeMarkdownUrl(url)).toBeNull();
    }
  });
});
