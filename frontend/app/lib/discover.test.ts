import { describe, expect, it } from "vitest";

import { discoverApiQuery, discoverHref, isFiltered, readDiscoverParams } from "./discover";

const read = (query: string) => readDiscoverParams(new URLSearchParams(query));

describe("readDiscoverParams", () => {
  it("defaults to projects, open source only, recently active, page 1", () => {
    expect(read("")).toMatchObject({ tab: "projects", q: "", open_source: "", sort: "", page: 1 });
    expect(isFiltered(read(""))).toBe(false);
  });

  it("keeps valid values and drops everything unexpected", () => {
    const params = read("tab=campaigns&q=%20sync%20&platform=linux&category=<script>&status=released&method=combined&free_places=1&open_source=all&sort=popular&page=-3");
    expect(params).toMatchObject({
      tab: "campaigns",
      q: "sync",
      platform: "linux",
      category: "",
      status: "",
      method: "combined",
      free_places: true,
      open_source: "all",
      sort: "",
      page: 1,
    });
    expect(isFiltered(params)).toBe(true);
  });
});

describe("discoverApiQuery and discoverHref", () => {
  it("sends only the filters of the chosen tab", () => {
    const projects = read("q=sync&status=beta&method=free&has_campaign=1&page=2");
    expect(discoverApiQuery(projects)).toBe("q=sync&status=beta&has_campaign=1&page=2");
    expect(discoverApiQuery({ ...projects, tab: "campaigns" })).toBe("q=sync&method=free&page=2");
  });

  it("builds links to other pages and tabs with the same search", () => {
    const params = read("q=sync&software_type=game&open_source=all");
    expect(discoverHref(params, { page: 2 })).toBe("/discover?q=sync&software_type=game&open_source=all&page=2");
    expect(discoverHref(params, { tab: "campaigns", page: 1 })).toBe("/discover?tab=campaigns&q=sync&software_type=game&open_source=all");
    expect(discoverHref(read(""))).toBe("/discover");
  });
});
