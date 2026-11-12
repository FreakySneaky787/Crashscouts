/* Clickable prototype: three visual concepts over the same data and flows. No backend. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- helpers
  const P = (id) => DATA.projects[id];
  const C = (id) => DATA.campaigns[id];
  const U = (id) => DATA.people[id];
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const PAGES = ["home", "discover", "testing", "projects", "project", "campaign", "profile"];
  const ACTIVITY_ORDER = ["lumen", "kestrel", "pgsnap", "tidewater", "quayside", "brightdesk", "orbit", "ledgerline"];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };

  const state = {
    concept: "a", page: "home", id: null, theme: store.get("proto-theme") || "system",
    tabs: {}, feedTab: "following", notes: false, menu: false, notifOpen: false,
    notifications: [
      { id: 1, unread: true, icon: "bug", text: "Ines Kovač confirmed your report #214", detail: "Sync stops after importing 300+ feeds", to: ["campaign", "tidewater-sync"], when: "3 hours ago" },
      { id: 2, unread: true, icon: "flask", text: "pgsnap is looking for Windows testers", detail: "Matches your device: Windows 11", to: ["campaign", "pgsnap-windows"], when: "2 hours ago" },
      { id: 3, unread: false, icon: "tag", text: "Lumen Notes 2.0.0-rc.1 is out", detail: "Campaign “2.0 release candidate” continues", to: ["campaign", "lumen-2"], when: "4 hours ago" },
    ],
    follows: new Set(["tidewater", "kestrel", "pgsnap"]), joined: new Set(DATA.joined), requested: new Set(),
    f: { q: "", platform: "", type: "", license: "", status: "", active: false },
  };

  const href = (page, id, concept = state.concept) => `#${concept}-${page}${id ? "-" + id : ""}`;
  const ic = (name, cls = "") => {
    const set = state.concept === "c" ? "il" : "i";
    return `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#${set}-${name}"></use></svg>`;
  };
  const icFill = (name) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#if-${name}"></use></svg>`;

  const PLATFORM_ICON = { Linux: "linux-logo", Windows: "windows-logo", macOS: "apple-logo", Android: "android-logo", Web: "globe" };
  const TYPE_ICON = { CLI: "terminal-window", Game: "game-controller", "Web app": "globe", "Desktop app": "app-window", "Desktop & mobile app": "devices" };
  const FB_ICON = { "Bug Report": "bug", "UX Feedback": "cursor-click", "Feature Suggestion": "lightbulb", "Compatibility Report": "devices", "General Feedback": "chat-text" };
  const FEED_ICON = { campaign: "flask", feedback: "bug", release: "tag", update: "megaphone", result: "list-checks", project: "package" };

  const CAMP_STATUS = { Draft: ["neutral", "circle"], Open: ["ok", "circle"], Full: ["warn", "users"], "In Progress": ["info", "circle-half"], Completed: ["neutral", "check-circle"], Cancelled: ["danger", "x-circle"] };
  const FB_STATUS = { New: "info", Reviewed: "neutral", Confirmed: "warn", "In Progress": "info", Fixed: "ok", Verified: "ok", Duplicate: "neutral", "Cannot Reproduce": "neutral", Rejected: "neutral" };
  const TASK_STATUS = { "Not Started": ["neutral", "circle"], "In Progress": ["info", "circle-half"], Completed: ["ok", "check-circle"], Blocked: ["danger", "prohibit"] };
  const PROJ_STATUS = { Development: "neutral", Alpha: "warn", Beta: "info", Stable: "ok", Archived: "neutral" };

  const pill = (kind, iconName, text) => `<span class="status ${kind}">${iconName ? ic(iconName) : ""}${esc(text)}</span>`;
  const campStatus = (c) => { const [k, i] = CAMP_STATUS[c.status]; return pill(k, i, c.status); };
  const fbStatus = (f) => pill(FB_STATUS[f.status], f.status === "Fixed" || f.status === "Verified" ? "check-circle" : "", f.status);
  const taskStatus = (t) => { const [k, i] = TASK_STATUS[t.status]; return pill(k, i, t.status); };
  const projStatus = (p) => pill(PROJ_STATUS[p.status], "", p.status);
  const license = (p) => p.openSource
    ? `<span class="lic">${ic("code")}Open source · <span class="mono">${esc(p.license)}</span></span>`
    : `<span class="lic closed">${ic("lock-simple")}Proprietary</span>`;
  const verified = (p) => p.verified ? `<span class="lic">${ic("shield-check")}Repository verified</span>` : "";
  const platforms = (list) => `<span class="platforms" role="img" aria-label="${esc(list.join(", "))}">${list.map((x) => PLATFORM_ICON[x] ? `<span title="${esc(x)}">${ic(PLATFORM_ICON[x])}</span>` : "").join("")}</span>`;
  const avatar = (u, cls = "") => `<span class="avatar ${cls}" style="--h:${u.hue}" aria-hidden="true">${esc(u.initials)}</span>`;
  const picon = (p, cls = "") => `<span class="picon ${cls}" style="--h:${p.hue}" aria-hidden="true">${esc(p.name.slice(0, 2))}</span>`;
  const person = (id) => `<a href="${href("profile", id)}">${esc(U(id).name)}</a>`;
  const projLink = (id) => `<a href="${href("project", id)}">${esc(P(id).name)}</a>`;
  const campLink = (id) => `<a href="${href("campaign", id)}">${esc(C(id).title)}</a>`;
  const meter = (value, max, label) => `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" aria-label="${esc(label)}"><span style="width:${Math.round((value / max) * 100)}%"></span></div>`;

  const publicCampaigns = () => Object.values(DATA.campaigns).filter((c) => c.visibility === "Public");
  const campsOf = (pid) => publicCampaigns().filter((c) => c.project === pid);
  const activeCamp = (pid) => campsOf(pid).find((c) => c.status === "Open" || c.status === "In Progress" || c.status === "Full");
  const feedbackOf = (cid) => DATA.feedback.filter((f) => f.campaign === cid && f.published);
  const feedbackOfProject = (pid) => DATA.feedback.filter((f) => C(f.campaign).project === pid && f.published);
  const feedbackBy = (uid) => DATA.feedback.filter((f) => f.author === uid && f.published);
  const taskProgress = (c) => ({ done: c.tasks.filter((t) => t.status === "Completed").length, total: c.tasks.length });
  const nextTask = (c) => c.tasks.find((t) => t.status === "In Progress" || t.status === "Not Started");

  function filteredProjects(onlyMine = false) {
    const f = state.f; const q = f.q.trim().toLowerCase();
    return ACTIVITY_ORDER.map(P).filter((p) => {
      if (onlyMine) return p.maintainers.includes(DATA.me);
      if (q && ![p.name, p.tagline, p.category, ...p.languages].join(" ").toLowerCase().includes(q)) return false;
      if (f.platform && !p.platforms.includes(f.platform)) return false;
      if (f.type && p.type !== f.type) return false;
      if (f.license === "open" && !p.openSource) return false;
      if (f.license === "closed" && p.openSource) return false;
      if (f.status && p.status !== f.status) return false;
      if (f.active && !activeCamp(p.id)) return false;
      return true;
    });
  }

  function joinButton(c, cls = "") {
    if (state.joined.has(c.id)) return `<span class="btn ${cls}" aria-disabled="true">${ic("check")}You're testing this</span>`;
    if (state.requested.has(c.id)) return `<span class="btn ${cls}" aria-disabled="true">${ic("hourglass-medium")}Request sent</span>`;
    if (c.status === "Full") return `<span class="btn ${cls}" aria-disabled="true">${ic("users")}Campaign is full</span>`;
    if (c.participation === "After approval") return `<button class="btn primary ${cls}" data-act="join" data-id="${c.id}">${ic("user-plus")}Request to join</button>`;
    return `<button class="btn primary ${cls}" data-act="join" data-id="${c.id}">${ic("plus")}Join campaign</button>`;
  }
  const followButton = (pid, cls = "") => {
    const on = state.follows.has(pid);
    return `<button class="btn ${cls}" data-act="follow" data-id="${pid}" aria-pressed="${on}">${ic(on ? "check" : "eye")}${on ? "Following" : "Follow"}</button>`;
  };

  function tabs(group, items, current) {
    return `<div class="tabs" role="tablist" aria-label="${esc(group)} sections">${items.map(([key, label, count]) =>
      `<button class="tab" role="tab" id="tab-${group}-${key}" aria-controls="panel-${group}" aria-selected="${key === current}" tabindex="${key === current ? 0 : -1}" data-act="tab" data-group="${group}" data-key="${key}">${esc(label)}${count != null ? `<span class="count num">${count}</span>` : ""}</button>`).join("")}</div>`;
  }
  const panel = (group, current, html) => `<div role="tabpanel" id="panel-${group}" aria-labelledby="tab-${group}-${current}" tabindex="0">${html}</div>`;
  const tabOf = (group, def) => state.tabs[group] || def;

  /* Placeholder visuals – clearly labelled, generated from the project's hue. */
  function shot(p, inTile = false) {
    const h = p.hue;
    if (p.shot === "cli") return inTile
      ? `<pre class="term clip" aria-hidden="true">${esc(p.cli)}</pre>`
      : `<pre class="term" tabindex="0" role="region" aria-label="Example terminal output of ${esc(p.name)}">${esc(p.cli)}</pre>`;
    if (p.shot === "game") {
      let cells = "";
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
        const lit = (r * 7 + c * 3) % 5 === 0;
        cells += `<rect x="${40 + c * 52}" y="${30 + r * 52}" width="44" height="44" rx="6" fill="${lit ? `hsl(${h} 60% 55%)` : "var(--shot-b)"}"/>`;
      }
      return `<svg class="shot" viewBox="0 0 400 250" role="img" aria-label="Placeholder screenshot of ${esc(p.name)}"><rect width="400" height="250" fill="var(--shot-a)"/>${cells}<circle cx="352" cy="125" r="22" fill="none" stroke="hsl(${h} 60% 55%)" stroke-width="4"/></svg>`;
    }
    if (p.shot === "app") {
      let rows = "";
      for (let i = 0; i < 6; i++) rows += `<rect x="128" y="${42 + i * 30}" width="${150 + ((i * 37) % 90)}" height="8" rx="3" fill="var(--shot-b)"/><rect x="128" y="${54 + i * 30}" width="${90 + ((i * 53) % 70)}" height="6" rx="3" fill="var(--shot-b)" opacity="0.6"/>`;
      return `<svg class="shot" viewBox="0 0 400 250" role="img" aria-label="Placeholder screenshot of ${esc(p.name)}"><rect width="400" height="250" fill="var(--shot-a)"/><rect x="0" y="0" width="400" height="22" fill="var(--shot-b)"/><rect x="0" y="22" width="110" height="228" fill="var(--shot-c)"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="14" y="${40 + i * 24}" width="${60 + (i % 3) * 12}" height="8" rx="3" fill="${i === 1 ? `hsl(${h} 55% 50%)` : "var(--shot-b)"}"/>`).join("")}${rows}</svg>`;
    }
    return "";
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------------------------------------------------------------- navigation model
  const NAV = [
    ["home", "Home", "house"], ["discover", "Discover", "compass"], ["testing", "Testing", "flask"],
    ["projects", "Your projects", "package"], [null, "Community", "users-three"], ["profile", "Profile", "user-circle"],
  ];
  const navCurrent = (page) => (page === "project" || page === "campaign" ? null : page);
  function navLinks(cls) {
    return NAV.map(([page, label, icon]) => {
      if (!page) return `<span class="dis" aria-disabled="true">${ic(icon)}${label}<span class="later">after beta</span></span>`;
      const id = page === "profile" ? DATA.me : null;
      const cur = navCurrent(state.page) === page && (page !== "profile" || state.id === DATA.me);
      return `<a class="${cls || ""}" href="${href(page, id)}"${cur ? ' aria-current="page"' : ""}>${ic(icon)}${label}</a>`;
    }).join("");
  }
  const THEMES = [["system", "monitor", "Use system setting"], ["light", "sun", "Light theme"], ["dark", "moon", "Dark theme"]];
  const themeToggle = () => `<div class="theme-toggle" role="group" aria-label="Colour theme">${THEMES.map(([v, i, l]) => `<button type="button" data-act="theme" data-value="${v}" aria-pressed="${state.theme === v}" title="${l}">${ic(i)}<span class="visually-hidden">${l}</span></button>`).join("")}</div>`;
  const searchField = (placeholder) => `<label class="field" for="q">${ic("magnifying-glass")}<span class="visually-hidden">Search</span><input id="q" type="search" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(state.f.q)}"></label>`;

  // ================================================================ CONCEPT A
  const A = {
    shell(content) {
      const followed = [...state.follows].map(P);
      return `<div class="a-app">
        <aside class="a-side${state.menu ? " open" : ""}" id="a-side" aria-label="Sidebar">
          <div class="a-brand"><span class="mark" aria-hidden="true">T</span>TestHub <small>working name</small></div>
          <nav class="a-nav" aria-label="Main">${navLinks()}</nav>
          <div><h2>Following</h2><div class="a-mini">${followed.map((p) => `<a href="${href("project", p.id)}">${picon(p)}${esc(p.name)}</a>`).join("") || '<span class="muted" style="padding:0 8px">Nothing yet</span>'}</div></div>
          <div><h2>Your campaigns</h2><div class="a-mini">${[...state.joined].map(C).map((c) => `<a href="${href("campaign", c.id)}">${picon(P(c.project))}${esc(c.title)}</a>`).join("")}</div></div>
        </aside>
        <div class="a-main">
          <div class="a-top">
            <button class="btn quiet a-menu" data-act="menu" aria-expanded="${state.menu}" aria-controls="a-side">${ic("list")}<span class="visually-hidden">Menu</span></button>
            ${searchField("Search projects, languages, categories")}<kbd aria-hidden="true">/</kbd>
            <span style="flex:1"></span>
            ${themeToggle()}
            ${A.notifications()}
            <a href="${href("profile", DATA.me)}" class="btn quiet a-me">${avatar(U(DATA.me))}<span class="visually-hidden">Your profile</span></a>
          </div>
          <main id="main" class="a-content" tabindex="-1">${content}</main>
        </div>
      </div>`;
    },
    notifications() {
      const unread = state.notifications.filter((n) => n.unread).length;
      return `<div class="a-notif"><button class="btn quiet" data-act="notif" aria-expanded="${state.notifOpen}" aria-controls="a-notif-pop">${ic("bell")}<span class="visually-hidden">Notifications</span>${unread ? `<span class="a-badge num" aria-label="${unread} unread">${unread}</span>` : ""}</button>
        <div class="a-pop" id="a-notif-pop" ${state.notifOpen ? "" : "hidden"}><header><strong>Notifications</strong>${unread ? '<button class="btn quiet" data-act="notif-read">Mark all as read</button>' : ""}</header>
        <ul class="a-rows">${state.notifications.map((n) => `<li class="${n.unread ? "unread" : ""}">${ic(n.icon)}<span class="t"><a href="${href(n.to[0], n.to[1])}" data-act="notif-go" data-id="${n.id}">${esc(n.text)}</a><span class="d">${esc(n.detail)}</span></span><time>${esc(n.when)}</time></li>`).join("")}</ul></div></div>`;
    },
    rowsFeed(items) {
      const groups = [["Today", (w) => /hour/.test(w)], ["Yesterday", (w) => w === "yesterday"], ["Earlier", () => true]];
      const used = new Set(); let out = "";
      for (const [label, test] of groups) {
        const list = items.filter((x, i) => !used.has(i) && test(x.when));
        items.forEach((x, i) => { if (!used.has(i) && test(x.when)) used.add(i); });
        if (!list.length) continue;
        out += `<h3 class="a-day">${label}</h3><ul class="a-rows">` + list.map((e) => `<li>${ic(FEED_ICON[e.kind])}<span class="t">${person(e.actor)} <span class="sec">${esc(e.text)}</span> · ${projLink(e.project)}<span class="d">${e.campaign ? `<a href="${href("campaign", e.campaign)}">${esc(e.detail)}</a>` : esc(e.detail)}</span></span><time>${esc(e.when)}</time></li>`).join("") + "</ul>";
      }
      return out;
    },
    myCampaignsPanel() {
      return `<section class="a-panel" aria-labelledby="a-myc"><header><h2 id="a-myc">Your campaigns</h2><span class="aside num">${state.joined.size}</span></header><ul class="a-rows">${[...state.joined].map(C).map((c) => {
        const pr = taskProgress(c); const nt = nextTask(c);
        return `<li>${ic("flask")}<span class="t"><a href="${href("campaign", c.id)}">${esc(c.title)}</a><span class="d">${esc(P(c.project).name)} · <span class="mono">${esc(c.version)}</span></span>${pr.total ? `<span class="d">${nt ? `Next: ${esc(nt.title)}` : "All tasks done"}</span>` : '<span class="d">Free testing – no task list</span>'}</span><span class="num muted">${pr.total ? `${pr.done}/${pr.total}` : ""}</span></li>`;
      }).join("")}</ul></section>`;
    },
    home() {
      const forDevices = publicCampaigns().filter((c) => c.status === "Open" && !state.joined.has(c.id));
      return `<div class="a-head"><div><h1 class="a-h1">Home</h1><div class="meta">Activity from projects you follow and campaigns you test</div></div></div>
        <div class="a-split">
          <section class="a-panel" aria-labelledby="a-act"><header><h2 id="a-act">Activity</h2><span class="aside">Chronological</span></header>${A.rowsFeed(DATA.feed)}</section>
          <div style="display:grid;gap:16px">${A.myCampaignsPanel()}
            <section class="a-panel" aria-labelledby="a-open"><header><h2 id="a-open">Looking for testers</h2></header><ul class="a-rows">${forDevices.map((c) => `<li>${ic("users")}<span class="t"><a href="${href("campaign", c.id)}">${esc(P(c.project).name)} · ${esc(c.title)}</a><span class="d">${esc(c.platforms.join(", "))}</span></span><span class="num muted">${c.testers}/${c.target}</span></li>`).join("")}</ul></section>
          </div>
        </div>`;
    },
    filters() {
      const opt = (key, label, values) => `<label>${label}<select data-act="filter" data-key="${key}" id="f-${key}"><option value="">Any</option>${values.map(([v, t]) => `<option value="${esc(v)}"${state.f[key] === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
      return `<div class="a-toolbar" role="group" aria-label="Filters">
        ${opt("platform", "Platform", ["Linux", "Windows", "macOS", "Android", "Web"].map((x) => [x, x]))}
        ${opt("type", "Type", ["Desktop app", "Desktop & mobile app", "Web app", "CLI", "Game"].map((x) => [x, x]))}
        ${opt("license", "License", [["open", "Open source"], ["closed", "Proprietary"]])}
        ${opt("status", "Status", ["Development", "Alpha", "Beta", "Stable"].map((x) => [x, x]))}
        <label><input type="checkbox" id="f-active" data-act="filter" data-key="active"${state.f.active ? " checked" : ""}> Looking for testers</label>
      </div>`;
    },
    projectTable(list) {
      if (!list.length) return `<p class="empty">No projects match these filters. Clear a filter to see more.</p>`;
      return `<div class="a-table-wrap"><table class="a-table"><thead><tr><th scope="col">Project</th><th scope="col">Type</th><th scope="col">Platforms</th><th scope="col">License</th><th scope="col">Status</th><th scope="col">Campaign</th><th scope="col" class="r">Followers</th></tr></thead><tbody>${list.map((p) => {
        const c = activeCamp(p.id);
        return `<tr><td><div class="pname">${picon(p)}<div><a href="${href("project", p.id)}">${esc(p.name)}</a><small>${esc(p.tagline)}</small></div></div></td><td>${ic(TYPE_ICON[p.type])} ${esc(p.type)}</td><td>${platforms(p.platforms)}</td><td>${license(p)}</td><td>${projStatus(p)}</td><td>${c ? `<a href="${href("campaign", c.id)}">${campStatus(c)}</a>` : '<span class="muted">—</span>'}</td><td class="r">${p.followers.toLocaleString("en")}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    },
    discover() {
      const list = filteredProjects();
      return `<div class="a-head"><div><h1 class="a-h1">Discover</h1><div class="meta"><span class="num">${list.length}</span> projects · sorted by recent activity</div></div></div>${A.filters()}<div id="results">${A.projectTable(list)}</div>`;
    },
    projects() {
      return `<div class="a-head"><div><h1 class="a-h1">Your projects</h1><div class="meta">Projects you maintain</div></div><div class="actions"><span class="btn" aria-disabled="true">${ic("plus")}New project</span></div></div>${A.projectTable(filteredProjects(true))}`;
    },
    testing() {
      const list = publicCampaigns();
      return `<div class="a-head"><div><h1 class="a-h1">Testing</h1><div class="meta">Public campaigns. Private campaigns appear only for invited testers.</div></div></div>
        <div class="a-table-wrap"><table class="a-table"><thead><tr><th scope="col">Campaign</th><th scope="col">Status</th><th scope="col">Method</th><th scope="col">Platforms</th><th scope="col" class="r">Testers</th><th scope="col" class="r">Ends</th><th scope="col">You</th></tr></thead><tbody>${list.map((c) =>
          `<tr><td><div class="pname">${picon(P(c.project))}<div><a href="${href("campaign", c.id)}">${esc(c.title)}</a><small>${esc(P(c.project).name)} · <span class="mono">${esc(c.version)}</span></small></div></div></td><td>${campStatus(c)}</td><td>${esc(c.method)}</td><td>${esc(c.platforms.join(", "))}</td><td class="r">${c.testers}/${c.target}</td><td class="r">${esc(c.ends)}</td><td>${state.joined.has(c.id) ? pill("ok", "check", "Joined") : state.requested.has(c.id) ? pill("neutral", "hourglass-medium", "Requested") : '<span class="muted">—</span>'}</td></tr>`).join("")}</tbody></table></div>`;
    },
    project(p) {
      const camps = campsOf(p.id); const fb = feedbackOfProject(p.id); const tab = tabOf("project", "overview");
      let body = "";
      if (tab === "overview") {
        const c = activeCamp(p.id);
        body = `<div class="a-split"><div style="display:grid;gap:16px">
            <section class="a-panel" aria-labelledby="a-about"><header><h2 id="a-about">About</h2></header><div class="body"><p class="b-prose" style="font-size:15px">${esc(p.description)}</p></div></section>
            ${c ? `<section class="a-panel" aria-labelledby="a-cur"><header><h2 id="a-cur">Current campaign</h2>${campStatus(c)}</header><div class="body"><a href="${href("campaign", c.id)}"><strong>${esc(c.title)}</strong></a><p class="sec">${esc(c.summary)}</p>${meter(c.testers, c.target, "Testers")}<div class="muted num">${c.testers} of ${c.target} testers · ends ${esc(c.ends)}</div><div>${joinButton(c)}</div></div></section>` : ""}
          </div>
          <section class="a-panel" aria-labelledby="a-spec"><header><h2 id="a-spec">Details</h2></header><div class="body"><dl class="kv">
            <dt>Repository</dt><dd>${p.repo ? `<a href="#" class="mono" data-act="ext">${esc(p.repo)} ${ic("arrow-square-out")}</a>` : '<span class="muted">Not public</span>'}</dd>
            <dt>License</dt><dd>${license(p)}</dd><dt>Type</dt><dd>${esc(p.type)}</dd><dt>Category</dt><dd>${esc(p.category)}</dd>
            <dt>Platforms</dt><dd>${esc(p.platforms.join(", "))}</dd><dt>Languages</dt><dd>${esc(p.languages.join(", "))}</dd>
            <dt>Latest</dt><dd class="mono">${esc(p.latestRelease)}</dd><dt>Maintainers</dt><dd>${p.maintainers.map(person).join(", ")}</dd>
          </dl></div></section></div>`;
      } else if (tab === "campaigns") {
        body = camps.length ? `<section class="a-panel"><ul class="a-rows">${camps.map((c) => `<li>${ic("flask")}<span class="t"><a href="${href("campaign", c.id)}">${esc(c.title)}</a><span class="d"><span class="mono">${esc(c.version)}</span> · ${esc(c.method)} · ${c.testers}/${c.target} testers</span></span>${campStatus(c)}</li>`).join("")}</ul></section>` : `<p class="empty">No public campaigns yet.</p>`;
      } else if (tab === "feedback") {
        body = A.feedbackTable(fb);
      } else {
        body = p.releases.length ? `<section class="a-panel"><ul class="a-rows">${p.releases.map((r) => `<li>${ic("tag")}<span class="t"><strong class="mono">${esc(r.v)}</strong><span class="d">${esc(r.notes)}</span></span><time>${esc(r.date)}</time></li>`).join("")}</ul></section>` : `<p class="empty">No releases published on this platform yet.</p>`;
      }
      return `<nav class="a-crumbs" aria-label="Breadcrumb"><a href="${href("discover")}">Discover</a>${ic("caret-right")}<span aria-current="page">${esc(p.name)}</span></nav>
        <div class="a-head">${picon(p, "lg")}<div style="min-width:0"><h1 class="a-h1">${esc(p.name)}</h1><p class="sec">${esc(p.tagline)}</p><div class="meta">${license(p)}${projStatus(p)}${verified(p)}<span class="num">${p.followers.toLocaleString("en")} followers</span><span>Updated ${esc(p.updated)}</span></div></div><div class="actions">${followButton(p.id)}</div></div>
        ${tabs("project", [["overview", "Overview"], ["campaigns", "Campaigns", camps.length], ["feedback", "Feedback", fb.length], ["releases", "Releases", p.releases.length]], tab)}
        ${panel("project", tab, body)}`;
    },
    feedbackTable(list) {
      if (!list.length) return `<p class="empty">No published feedback yet. Reports stay private until a maintainer publishes them.</p>`;
      return `<div class="a-table-wrap"><table class="a-table"><thead><tr><th scope="col">#</th><th scope="col">Report</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Reporter</th><th scope="col">Environment</th><th scope="col" class="r">Replies</th></tr></thead><tbody>${list.map((f) =>
        `<tr><td class="mono muted">${f.id}</td><td><strong>${esc(f.title)}</strong></td><td>${ic(FB_ICON[f.type])} ${esc(f.type)}</td><td>${fbStatus(f)}</td><td>${person(f.author)}</td><td class="mono">${esc(f.os)} · ${esc(f.version)}</td><td class="r">${f.comments}</td></tr>`).join("")}</tbody></table></div><p class="ext-note">${ic("lock-simple")}Only published reports are listed. Unpublished reports are visible to the reporter and the maintainers.</p>`;
    },
    campaign(c) {
      const p = P(c.project); const pr = taskProgress(c); const fb = feedbackOf(c.id); const tab = tabOf("campaign", c.tasks.length ? "tasks" : "details");
      let body = "";
      if (tab === "tasks") {
        body = `<section class="a-panel"><header><h2>Tasks</h2><span class="aside num">${pr.done} of ${pr.total} done</span></header><ol class="a-tasks">${c.tasks.map((t) => `<li><span class="no">${t.id}</span><span>${esc(t.title)}${t.note ? `<br><small class="muted">${esc(t.note)}</small>` : ""}</span>${taskStatus(t)}</li>`).join("")}</ol></section>`;
      } else if (tab === "feedback") {
        body = A.feedbackTable(fb);
      } else if (tab === "participants") {
        const ids = ["mara", "aiko", "sam", "priya"];
        body = `<section class="a-panel"><header><h2>Participants</h2><span class="aside num">${c.testers} testers</span></header><ul class="a-rows">${ids.map((id) => `<li>${avatar(U(id))}<span class="t">${person(id)}<span class="d">${esc(U(id).devices[0])}</span></span><span class="muted">${esc(U(id).location)}</span></li>`).join("")}<li><span></span><span class="t muted">and ${c.testers - ids.length} more</span><span></span></li></ul></section>`;
      } else {
        body = `<section class="a-panel"><header><h2>Details</h2></header><div class="body"><dl class="kv">
          <dt>Summary</dt><dd>${esc(c.summary)}</dd><dt>Requirements</dt><dd>${c.requirements.map(esc).join("<br>") || "None"}</dd>
          <dt>Hardware</dt><dd>${esc(c.hardware)}</dd><dt>Changes</dt><dd>${c.changelog.map(esc).join("<br>")}</dd></dl></div></section>`;
      }
      return `<nav class="a-crumbs" aria-label="Breadcrumb"><a href="${href("testing")}">Testing</a>${ic("caret-right")}<a href="${href("project", p.id)}">${esc(p.name)}</a>${ic("caret-right")}<span aria-current="page">${esc(c.title)}</span></nav>
        <div class="a-head"><div style="min-width:0"><h1 class="a-h1">${esc(c.title)} <span class="mono sec">${esc(c.version)}</span></h1><div class="meta">${campStatus(c)}<span>${esc(c.method)} testing</span><span>${ic(c.visibility === "Public" ? "globe" : "lock-simple")} ${esc(c.visibility)}</span><span>${esc(c.participation)}</span><span class="num">${esc(c.starts)} – ${esc(c.ends)}</span></div></div><div class="actions">${state.joined.has(c.id) ? `${pill("ok", "check", "You're testing this")}<button class="btn primary" data-act="report" data-id="${c.id}">${ic("bug")}Report feedback</button>` : joinButton(c)}</div></div>
        <div class="a-split"><div style="display:grid;gap:12px;min-width:0">
          ${tabs("campaign", [...(c.tasks.length ? [["tasks", "Tasks", c.tasks.length]] : []), ["feedback", "Feedback", fb.length], ["participants", "Participants", c.testers], ["details", "Details"]], tab)}
          ${panel("campaign", tab, body)}
          ${state.joined.has(c.id) ? A.myReports(c) : ""}
        </div>
        <div style="display:grid;gap:16px">
          <section class="a-panel" aria-labelledby="a-part"><header><h2 id="a-part">Participation</h2></header><div class="body">${meter(c.testers, c.target, "Testers")}<div class="num">${c.testers} of ${c.target} testers · ${c.daysLeft} days left</div>${pr.total && state.joined.has(c.id) ? `${meter(pr.done, pr.total, "Your tasks")}<div class="num sec">Your tasks: ${pr.done} of ${pr.total}</div>` : ""}</div></section>
          <section class="a-panel" aria-labelledby="a-env"><header><h2 id="a-env">Test on</h2></header><div class="body"><div class="chips">${c.platforms.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div></div></section>
          <section class="a-panel" aria-labelledby="a-dl"><header><h2 id="a-dl">Downloads</h2></header><div class="body">${c.downloads.map((d) => `<a href="#" data-act="ext" class="btn">${ic("download-simple")}${esc(d.label)} <span class="mono muted">${esc(d.host)}</span></a>`).join("")}<p class="ext-note">${ic("warning")}Downloads come from the project's own sources. You will see a warning before leaving.</p></div></section>
        </div></div>${state.joined.has(c.id) ? A.reportDialog(c) : ""}`;
    },
    myReports(c) {
      const mine = DATA.feedback.filter((f) => f.campaign === c.id && f.author === DATA.me);
      return `<section class="a-panel" aria-labelledby="a-mine"><header><h2 id="a-mine">Your reports</h2><span class="aside num">${mine.length}</span></header>${mine.length ? `<ul class="a-rows">${mine.map((f) => `<li>${ic(FB_ICON[f.type])}<span class="t"><strong>${esc(f.title)}</strong><span class="d"><span class="mono">#${f.id}</span> · ${esc(f.type)} · ${esc(f.os)} · ${esc(f.when)}</span></span><span class="a-repmeta">${f.published ? "" : `<span class="lic">${ic("lock-simple")}Private</span>`}${fbStatus(f)}</span></li>`).join("")}</ul>` : `<div class="body"><p class="empty">You have not reported anything in this campaign yet.</p></div>`}</section>`;
    },
    reportDialog(c) {
      const me = U(DATA.me);
      const types = ["Bug Report", "UX Feedback", "Feature Suggestion", "Compatibility Report", "General Feedback"];
      return `<dialog class="a-dialog" id="report-dialog" aria-labelledby="rd-title">
        <form id="report-form" data-campaign="${c.id}" novalidate>
          <header><h2 id="rd-title">Report feedback</h2><span class="muted">${esc(P(c.project).name)} · <span class="mono">${esc(c.version)}</span></span><button type="button" class="btn quiet" data-act="report-close">${ic("x")}<span class="visually-hidden">Close</span></button></header>
          <div class="a-form">
            <fieldset class="a-types"><legend>Type</legend>${types.map((t, i) => `<label><input type="radio" name="type" value="${t}"${i === 0 ? " checked" : ""}>${ic(FB_ICON[t])}${esc(t.replace(" Report", "").replace(" Feedback", "").replace(" Suggestion", ""))}</label>`).join("")}</fieldset>
            <label for="rf-title">Title</label><input id="rf-title" name="title" required maxlength="140" placeholder="What happened, in one line">
            <p class="a-err" id="rf-title-err" hidden>Add a title so maintainers can find your report.</p>
            <label for="rf-steps">Steps to reproduce</label><textarea id="rf-steps" name="steps" rows="3" placeholder="1. …&#10;2. …"></textarea>
            <div class="a-two"><div><label for="rf-exp">Expected</label><textarea id="rf-exp" name="expected" rows="2"></textarea></div><div><label for="rf-act">Actual</label><textarea id="rf-act" name="actual" rows="2"></textarea></div></div>
            <div class="a-two"><div><label for="rf-env">Device</label><select id="rf-env" name="env">${me.devices.map((d) => `<option>${esc(d)}</option>`).join("")}</select></div><div><label for="rf-ver">Version</label><input id="rf-ver" name="version" class="mono" value="${esc(c.version)}"></div></div>
            <p class="ext-note">${ic("paperclip")}Attachments: PNG, JPEG, WebP, TXT, LOG or JSON. Remove personal data from logs and screenshots.</p>
            <p class="ext-note">${ic("lock-simple")}Private until a maintainer publishes it. Only you and the maintainers can see it.</p>
          </div>
          <footer><button type="button" class="btn" data-act="report-close">Cancel</button><button type="submit" class="btn primary">Send report</button></footer>
        </form></dialog>`;
    },
    profile(u) {
      const fb = feedbackBy(u.id); const rate = Math.round((u.stats.confirmed / u.stats.reports) * 100);
      return `<div class="a-head">${avatar(u, "lg")}<div><h1 class="a-h1">${esc(u.name)}</h1><div class="meta"><span>${esc(u.role)}</span><span>${esc(u.location)}</span><span>Joined ${esc(u.joined)}</span></div><p class="sec" style="margin-top:6px;max-width:70ch">${esc(u.bio)}</p></div></div>
        <div class="a-split"><div style="display:grid;gap:16px;min-width:0">
          <section class="a-panel" aria-labelledby="a-dev"><header><h2 id="a-dev">Test devices</h2><span class="aside num">${u.devices.length}</span></header><ul class="a-rows">${u.devices.map((d) => { const [os, hw] = d.split(" · "); return `<li>${ic("monitor")}<span class="t"><strong>${esc(os)}</strong><span class="d">${esc(hw || "")}</span></span><span></span></li>`; }).join("")}</ul></section>
          <section class="a-panel" aria-labelledby="a-rep"><header><h2 id="a-rep">Recent reports</h2></header>${fb.length ? `<ul class="a-rows">${fb.map((f) => `<li>${ic(FB_ICON[f.type])}<span class="t"><strong>${esc(f.title)}</strong><span class="d">${esc(P(C(f.campaign).project).name)} · <span class="mono">#${f.id}</span></span></span>${fbStatus(f)}</li>`).join("")}</ul>` : `<div class="body"><p class="empty">No published reports yet.</p></div>`}</section>
        </div><div style="display:grid;gap:16px">
          <section class="a-panel" aria-labelledby="a-st"><header><h2 id="a-st">Testing record</h2></header><div class="body"><dl class="kv"><dt>Campaigns</dt><dd class="num">${u.stats.campaigns}</dd><dt>Reports</dt><dd class="num">${u.stats.reports}</dd><dt>Confirmed</dt><dd class="num">${u.stats.confirmed} (${rate}%)</dd></dl></div></section>
          <section class="a-panel" aria-labelledby="a-sk"><header><h2 id="a-sk">Skills</h2></header><div class="body"><div class="chips">${u.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></div></section>
          ${u.recognitions ? `<section class="a-panel" aria-labelledby="a-rec"><header><h2 id="a-rec">Recognitions</h2></header><ul class="a-rows">${u.recognitions.map((r) => `<li>${ic("shield-check")}<span class="t"><strong>${esc(r.name)}</strong><span class="d" style="white-space:normal">${esc(r.reason)}</span></span><span></span></li>`).join("")}</ul></section>` : ""}
        </div></div>`;
    },
  };

  // ================================================================ CONCEPT B
  const B = {
    shell(content) {
      return `<div class="b-app">
        <aside class="b-left" aria-label="Sidebar">
          <div class="b-brand"><span class="dot" aria-hidden="true"></span>TestHub <small>working name</small></div>
          <nav class="b-nav" aria-label="Main">${navLinks()}</nav>
          ${themeToggle()}
        </aside>
        <main id="main" class="b-center" tabindex="-1">
          ${content}
        </main>
        <aside class="b-right" aria-label="Your testing">
          ${state.page === "discover" ? "" : `<div class="b-search">${searchField("Search projects")}</div>`}
          ${B.myCampaignsCard()}
          <section class="b-card" aria-labelledby="b-who"><h2 id="b-who">Testers active this week</h2><div class="b-people">${["aiko", "priya", "sam"].map((id) => `<a class="b-person" href="${href("profile", id)}">${avatar(U(id))}<span><strong>${esc(U(id).name)}</strong><small>${esc(U(id).devices[0].split(" · ")[0])}</small></span></a>`).join("")}</div></section>
        </aside>
        <nav class="b-bottom" aria-label="Main">${NAV.filter(([p]) => p && p !== "projects").map(([page, label, icon]) => { const id = page === "profile" ? DATA.me : null; const cur = navCurrent(state.page) === page && (page !== "profile" || state.id === DATA.me); return `<a href="${href(page, id)}"${cur ? ' aria-current="page"' : ""}>${ic(icon)}${label}</a>`; }).join("")}</nav>
      </div>`;
    },
    myCampaignsCard() {
      return `<section class="b-card" aria-labelledby="b-myc"><h2 id="b-myc">You're testing</h2>${[...state.joined].map(C).map((c) => { const pr = taskProgress(c); return `<div style="display:grid;gap:6px"><a href="${href("campaign", c.id)}"><strong>${esc(P(c.project).name)}</strong> · ${esc(c.title)}</a>${pr.total ? `${meter(pr.done, pr.total, "Your tasks")}<small class="muted num">${pr.done} of ${pr.total} tasks done</small>` : '<small class="muted">Free testing · ends ' + esc(c.ends) + "</small>"}</div>`; }).join("")}</section>`;
    },
    post(e) {
      const p = P(e.project);
      const target = e.campaign ? href("campaign", e.campaign) : href("project", e.project);
      return `<article class="b-post">${avatar(U(e.actor))}<div class="who">${person(e.actor)} ${esc(e.text)} <time>· ${esc(e.when)}</time></div>
        <a class="b-obj" href="${target}">${picon(p)}<span><strong>${esc(p.name)}</strong><span class="sub">${esc(e.detail)}</span></span></a>
        <div class="foot"><span>${ic(FEED_ICON[e.kind])} ${esc({ campaign: "Test campaign", feedback: "Feedback", release: "Release", update: "Project update", result: "Test result", project: "New project" }[e.kind])}</span>${!state.follows.has(e.project) ? `<button class="btn quiet" data-act="follow" data-id="${e.project}" aria-pressed="false">${ic("eye")}Follow ${esc(p.name)}</button>` : ""}</div></article>`;
    },
    home() {
      const tab = state.feedTab;
      const items = DATA.feed.filter((e) => tab === "everything" || (tab === "campaigns" ? ["campaign", "result"].includes(e.kind) : state.follows.has(e.project) || e.actor === DATA.me));
      return `<h1 class="visually-hidden">Home</h1>
        <div class="b-feedtabs"><div class="b-filters" role="group" aria-label="Show">${[["following", "Following"], ["everything", "Everything"], ["campaigns", "Campaigns"]].map(([k, l]) => `<button data-act="feedtab" data-key="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div></div>
        ${items.length ? items.map(B.post).join("") : `<p class="empty">Nothing here yet. Follow a project in Discover to see its updates.</p>`}
        <p class="b-note">${ic("clock")}Newest first. No ranking by popularity.</p>`;
    },
    filters() {
      const chip = (key, value, label) => `<button data-act="chip" data-key="${key}" data-value="${esc(value)}" aria-pressed="${state.f[key] === value}">${label}</button>`;
      return `<div style="display:grid;gap:10px">
        <div class="b-filters" role="group" aria-label="Platform">${["Linux", "Windows", "macOS", "Android", "Web"].map((x) => chip("platform", x, `${PLATFORM_ICON[x] ? ic(PLATFORM_ICON[x]) : ""} ${x}`)).join("")}</div>
        <div class="b-filters" role="group" aria-label="More filters">${chip("type", "CLI", "Command line")}${chip("type", "Game", "Games")}${chip("license", "open", "Open source only")}<button data-act="filter-toggle" data-key="active" aria-pressed="${state.f.active}">Looking for testers</button></div>
      </div>`;
    },
    entries(list) {
      if (!list.length) return `<p class="empty">No projects match. Remove a filter to see more.</p>`;
      return `<ul class="b-list">${list.map((p) => { const c = activeCamp(p.id); return `<li class="b-entry">${picon(p)}<h3><a href="${href("project", p.id)}">${esc(p.name)}</a></h3>${followButton(p.id)}<p class="sec" style="grid-column:2/-1">${esc(p.tagline)}</p><div class="meta">${platforms(p.platforms)}<span>${esc(p.type)}</span>${license(p)}${projStatus(p)}</div>${c ? `<div class="camp">${ic("flask")} <a href="${href("campaign", c.id)}">${esc(c.title)}</a> · <span class="num">${c.testers}/${c.target}</span> testers</div>` : ""}</li>`; }).join("")}</ul>`;
    },
    discover() {
      const list = filteredProjects();
      return `<h1 style="font-size:26px">Discover</h1><div class="b-search">${searchField("Search by name, language or category")}</div>${B.filters()}
        <p class="b-note">${ic("sort-ascending")}Sorted by recent activity, not popularity, so new and small projects are seen too.</p><div id="results">${B.entries(list)}</div>`;
    },
    projects() { return `<h1 style="font-size:26px">Your projects</h1>${B.entries(filteredProjects(true))}`; },
    testing() {
      const open = publicCampaigns().filter((c) => !state.joined.has(c.id));
      return `<h1 style="font-size:26px">Testing</h1>${B.myCampaignsCard()}
        <section class="b-card" aria-labelledby="b-lft"><h2 id="b-lft">Looking for testers</h2><ul class="b-list">${open.map((c) => `<li style="display:grid;gap:4px;border-top:1px solid var(--line);padding-top:10px"><a href="${href("campaign", c.id)}"><strong>${esc(P(c.project).name)}</strong> · ${esc(c.title)}</a><span class="sec">${esc(c.summary)}</span><span style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${campStatus(c)}<small class="muted num">${c.testers}/${c.target} testers · ends ${esc(c.ends)}</small></span></li>`).join("")}</ul><p class="b-note">${ic("lock-simple")}Private campaigns are only visible to invited testers.</p></section>`;
    },
    project(p) {
      const tab = tabOf("project", "overview"); const camps = campsOf(p.id); const fb = feedbackOfProject(p.id); const c = activeCamp(p.id);
      let body = "";
      if (tab === "overview") {
        body = `<p class="b-prose">${esc(p.description)}</p>
          ${c ? `<section class="b-card" aria-labelledby="b-lt"><h2 id="b-lt">${ic("flask")} Looking for testers</h2><a href="${href("campaign", c.id)}"><strong>${esc(c.title)}</strong></a><p class="sec">${esc(c.summary)}</p>${meter(c.testers, c.target, "Testers")}<small class="muted num">${c.testers} of ${c.target} testers · ${c.daysLeft} days left</small><div>${joinButton(c)}</div></section>` : ""}
          <section class="b-card" aria-labelledby="b-mt"><h2 id="b-mt">Maintained by</h2><div class="b-people">${p.maintainers.map((id) => `<a class="b-person" href="${href("profile", id)}">${avatar(U(id))}<span><strong>${esc(U(id).name)}</strong><small>${esc(U(id).location)}</small></span></a>`).join("")}</div></section>
          <section class="b-card"><h2>Facts</h2><dl class="kv"><dt>License</dt><dd>${license(p)}</dd><dt>Runs on</dt><dd>${esc(p.platforms.join(", "))}</dd><dt>Written in</dt><dd>${esc(p.languages.join(", "))}</dd><dt>Latest release</dt><dd class="mono">${esc(p.latestRelease)}</dd><dt>Source</dt><dd>${p.repo ? `<a href="#" data-act="ext">${esc(p.repo)}</a>` : '<span class="muted">Not public</span>'}</dd></dl></section>`;
      } else if (tab === "campaigns") {
        body = camps.length ? camps.map((x) => `<section class="b-card"><a href="${href("campaign", x.id)}"><strong>${esc(x.title)}</strong></a><p class="sec">${esc(x.summary)}</p><span>${campStatus(x)}</span></section>`).join("") : `<p class="empty">No public campaigns yet.</p>`;
      } else if (tab === "feedback") {
        body = B.feedbackList(fb);
      } else {
        body = p.releases.length ? p.releases.map((r) => `<section class="b-card"><h2 class="mono" style="font-size:15px">${esc(r.v)}</h2><p>${esc(r.notes)}</p><small class="muted">${esc(r.date)}</small></section>`).join("") : `<p class="empty">No releases published here yet.</p>`;
      }
      return `<header class="b-phead">${picon(p)}<h1>${esc(p.name)}</h1><p class="tag">${esc(p.tagline)}</p><div class="actions">${followButton(p.id)}<span class="b-note" style="align-self:center">${verified(p)}</span></div></header>
        ${tabs("project", [["overview", "Overview"], ["campaigns", "Campaigns", camps.length], ["feedback", "Feedback", fb.length], ["releases", "Releases", p.releases.length]], tab)}
        ${panel("project", tab, `<div style="display:flex;flex-direction:column;gap:16px;padding-top:4px">${body}</div>`)}`;
    },
    feedbackList(list) {
      if (!list.length) return `<p class="empty">No published feedback yet. Reports stay private until a maintainer publishes them.</p>`;
      return `<div class="b-card"><ul class="b-list" style="gap:0">${list.map((f) => `<li style="display:grid;grid-template-columns:28px minmax(0,1fr);gap:2px 10px;padding:10px 0;border-top:1px solid var(--line)"><span>${ic(FB_ICON[f.type], "lg")}</span><strong>${esc(f.title)}</strong><span style="grid-column:2;display:flex;gap:10px;flex-wrap:wrap;align-items:center">${fbStatus(f)}<small class="muted">${esc(f.type)} by ${esc(U(f.author).name)} · ${esc(f.when)} · ${f.comments} replies</small></span></li>`).join("")}</ul><p class="b-note">${ic("lock-simple")}Unpublished reports are visible only to the reporter and the maintainers.</p></div>`;
    },
    campaign(c) {
      const p = P(c.project); const fb = feedbackOf(c.id); const pr = taskProgress(c); const first = fb[0];
      return `<a href="${href("project", p.id)}" class="b-note">${ic("arrow-left")}${esc(p.name)}</a>
        <header style="display:grid;gap:6px"><h1 style="font-size:28px">${esc(c.title)}</h1><p class="sec">${esc(p.name)} <span class="mono">${esc(c.version)}</span> · ${esc(c.method)} testing · ${esc(c.participation)}</p><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${campStatus(c)}<span class="b-note">${ic("calendar-blank")}${esc(c.starts)} – ${esc(c.ends)}</span></div></header>
        <p class="b-prose">${esc(c.summary)}</p>
        <section class="b-card" aria-labelledby="b-join"><h2 id="b-join">Take part</h2>${meter(c.testers, c.target, "Testers")}<small class="muted num">${c.testers} of ${c.target} testers · ${c.daysLeft} days left</small><div class="chips">${c.platforms.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div><div>${joinButton(c)}</div></section>
        ${c.tasks.length ? `<section class="b-card" aria-labelledby="b-what"><h2 id="b-what">What to test <small class="muted num" style="font-weight:400">· ${pr.done} of ${pr.total} done</small></h2><ol class="b-steps">${c.tasks.map((t) => `<li><span class="num muted">${t.id}.</span><span>${esc(t.title)}${t.note ? `<br><small class="muted">${esc(t.note)}</small>` : ""}</span>${taskStatus(t)}</li>`).join("")}</ol></section>` : ""}
        <section class="b-card" aria-labelledby="b-before"><h2 id="b-before">Before you start</h2><ul style="padding-left:20px;display:grid;gap:4px">${c.requirements.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><div style="display:flex;gap:8px;flex-wrap:wrap">${c.downloads.map((d) => `<a href="#" data-act="ext" class="btn">${ic("download-simple")}${esc(d.label)}</a>`).join("")}</div><p class="ext-note">${ic("warning")}Downloads come from the project's own sources (${esc(c.downloads.map((d) => d.host).join(", "))}). You will see a warning before leaving.</p></section>
        <section aria-labelledby="b-fb" style="display:grid;gap:12px"><h2 id="b-fb" style="font-size:20px">Feedback</h2>${B.feedbackList(fb)}</section>
        ${first && c.id === "tidewater-sync" ? `<section class="b-card" aria-labelledby="b-thread"><h2 id="b-thread">Discussion · #${first.id} ${esc(first.title)}</h2><div class="b-thread">${DATA.discussion.map((d, i) => `<div class="b-reply">${avatar(U(d.author))}<div>${person(d.author)} <small class="muted">· ${esc(d.when)}</small></div><div style="grid-column:2;display:grid;gap:8px">${i === 1 ? `<blockquote class="b-quote" style="margin:0">${esc(DATA.discussion[0].text.slice(0, 92))}…</blockquote>` : ""}<p>${esc(d.text)}</p></div></div>`).join("")}</div></section>` : ""}`;
    },
    profile(u) {
      const fb = feedbackBy(u.id);
      return `<header class="b-profilehead">${avatar(u)}<h1 style="font-size:26px">${esc(u.name)}</h1><p class="sec">${esc(u.role)} · ${esc(u.location)}</p><p class="b-prose" style="max-width:52ch">${esc(u.bio)}</p>
        <div class="b-stats"><div><strong>${u.stats.campaigns}</strong><span>campaigns</span></div><div><strong>${u.stats.reports}</strong><span>reports</span></div><div><strong>${u.stats.confirmed}</strong><span>confirmed</span></div></div></header>
        <section class="b-card" aria-labelledby="b-tests"><h2 id="b-tests">Tests on</h2><ul class="b-list" style="gap:8px">${u.devices.map((d) => { const [os, hw] = d.split(" · "); const k = Object.keys(PLATFORM_ICON).find((x) => os.includes(x === "macOS" ? "macOS" : x) || (x === "Linux" && /Fedora|Arch|Debian|Ubuntu/.test(os))); return `<li style="display:flex;gap:10px;align-items:center">${ic(PLATFORM_ICON[k] || "monitor", "lg")}<span><strong>${esc(os)}</strong><br><small class="muted">${esc(hw || "")}</small></span></li>`; }).join("")}</ul></section>
        ${u.recognitions ? `<section class="b-card" aria-labelledby="b-rec"><h2 id="b-rec">Recognized for</h2>${u.recognitions.map((r) => `<div><strong>${esc(r.name)}</strong><p class="sec">${esc(r.reason)}</p></div>`).join("")}</section>` : ""}
        <section class="b-card" aria-labelledby="b-help"><h2 id="b-help">Can help with</h2><div class="chips">${u.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>
        <section aria-labelledby="b-rr" style="display:grid;gap:12px"><h2 id="b-rr" style="font-size:20px">Recent reports</h2>${B.feedbackList(fb)}</section>`;
    },
  };

  // ================================================================ CONCEPT C
  const C_ = {
    shell(content) {
      return `<header class="c-top"><div class="c-top-inner">
          <a class="c-brand" href="${href("home")}">TestHub<small>working name</small></a>
          <nav class="c-nav" aria-label="Main">${navLinks()}</nav>
          ${searchField("Search software")}
          ${themeToggle()}
        </div></header>
        <main id="main" class="c-main" tabindex="-1">${content}</main>`;
    },
    visual(p, inTile = false) {
      if (p.shot) return shot(p, inTile);
      return `<div class="typo" aria-hidden="true">${esc(p.tagline)}</div>`;
    },
    tile(p, w = "w4") {
      const c = activeCamp(p.id);
      return `<a class="c-tile ${w}" href="${href("project", p.id)}"><div class="vis">${C_.visual(p, true)}</div><div class="txt"><span class="c-label">${esc(p.category)} · ${esc(p.type)}</span><h3>${esc(p.name)}</h3><p>${esc(p.tagline)}</p><div class="row">${platforms(p.platforms)}${c ? campStatus(c) : `<span class="lic">${p.openSource ? "Open source" : "Proprietary"}</span>`}</div></div></a>`;
    },
    bands(list) {
      return `<div class="c-bands">${list.map((c) => { const pr = taskProgress(c); const nt = nextTask(c); return `<article class="c-band"><div><span class="c-label">${esc(P(c.project).name)} · ${esc(c.version)}</span><h3><a href="${href("campaign", c.id)}">${esc(c.title)}</a></h3></div><div style="display:grid;gap:6px">${pr.total ? `${meter(pr.done, pr.total, "Your tasks")}<span class="c-label">${pr.done}/${pr.total} tasks · next: ${esc(nt ? nt.title : "done")}</span>` : `<span class="c-label">Free testing · ends ${esc(c.ends)}</span>`}</div><a class="btn primary" href="${href("campaign", c.id)}">Continue ${ic("arrow-right")}</a></article>`; }).join("")}</div>`;
    },
    home() {
      const lft = publicCampaigns().filter((c) => (c.status === "Open" || c.status === "Full") && !state.joined.has(c.id)).map((c) => P(c.project));
      const recent = ["kestrel", "ledgerline", "quayside"].map(P);
      return `<h1 class="visually-hidden">Home</h1>
        <section class="c-section" aria-labelledby="c-now"><h2 id="c-now" class="c-h2">Now testing</h2>${C_.bands([...state.joined].map(C))}</section>
        <section class="c-section" aria-labelledby="c-lft"><h2 id="c-lft" class="c-h2">Looking for testers <a href="${href("testing")}">All campaigns</a></h2><div class="c-shelf">${lft.map((p, i) => C_.tile(p, lft.length === 1 ? "w8 wide-sm" : i === 0 ? "w8 wide-sm" : "w4")).join("")}</div></section>
        <section class="c-section" aria-labelledby="c-new"><h2 id="c-new" class="c-h2">Recently updated <a href="${href("discover")}">Discover</a></h2><div class="c-shelf">${recent.map((p) => C_.tile(p, "w4")).join("")}</div></section>
        <section class="c-section" aria-labelledby="c-act"><h2 id="c-act" class="c-h2">Activity</h2><ul class="c-list">${DATA.feed.map((e) => `<li><span class="c-label">${esc(e.when)}</span><span>${person(e.actor)} ${esc(e.text)} · ${projLink(e.project)}<br><span class="sec">${esc(e.detail)}</span></span><span>${ic(FEED_ICON[e.kind], "lg")}</span></li>`).join("")}</ul></section>`;
    },
    filters() {
      const group = (key, legend, values) => `<fieldset><legend>${legend}</legend>${[["", "Any"], ...values].map(([v, l]) => `<label><input type="radio" name="f-${key}" data-act="radio" data-key="${key}" value="${esc(v)}"${state.f[key] === v ? " checked" : ""}> ${esc(l)}</label>`).join("")}</fieldset>`;
      return `<div class="c-filters" role="group" aria-label="Filters">
        ${group("platform", "PLATFORM", ["Linux", "Windows", "macOS", "Android", "Web"].map((x) => [x, x]))}
        ${group("type", "TYPE", ["Desktop app", "Web app", "CLI", "Game"].map((x) => [x, x]))}
        ${group("license", "LICENSE", [["open", "Open source"], ["closed", "Proprietary"]])}
        <fieldset><legend>CAMPAIGNS</legend><label><input type="checkbox" id="f-active" data-act="filter" data-key="active"${state.f.active ? " checked" : ""}> Looking for testers</label></fieldset>
      </div>`;
    },
    results(list) { return list.length ? `<div class="c-results">${list.map((p) => C_.tile(p, "")).join("")}</div>` : `<p class="empty">No software matches these filters.</p>`; },
    discover() {
      const list = filteredProjects();
      return `<h1 class="c-h2" style="font-size:32px">Discover <span class="c-label num">${list.length} projects · newest activity first</span></h1><div class="c-grid2">${C_.filters()}<div id="results">${C_.results(list)}</div></div>`;
    },
    projects() { return `<h1 class="c-h2" style="font-size:32px">Your projects</h1>${C_.results(filteredProjects(true))}`; },
    testing() {
      const open = publicCampaigns().filter((c) => !state.joined.has(c.id));
      return `<h1 class="c-h2" style="font-size:32px">Testing</h1><section class="c-section" aria-labelledby="c-y"><h2 id="c-y" class="c-h2">Yours</h2>${C_.bands([...state.joined].map(C))}</section>
        <section class="c-section" aria-labelledby="c-o"><h2 id="c-o" class="c-h2">Open to join</h2><ul class="c-list">${open.map((c) => `<li><span class="c-label">${esc(c.ends)}</span><span><a href="${href("campaign", c.id)}"><strong>${esc(P(c.project).name)} · ${esc(c.title)}</strong></a><br><span class="sec">${esc(c.summary)}</span></span>${campStatus(c)}</li>`).join("")}</ul><p class="c-label">Private campaigns are visible to invited testers only.</p></section>`;
    },
    project(p) {
      const c = activeCamp(p.id); const fb = feedbackOfProject(p.id);
      return `<div class="c-proj"><div class="c-section" style="min-width:0">
          <span class="c-label">${esc(p.category)} · ${esc(p.type)}</span>
          <h1 class="c-ptitle">${esc(p.name)}</h1><p class="c-tagline">${esc(p.tagline)}</p>
          <div class="c-strip"><span>${p.openSource ? esc(p.license) : "Proprietary"}</span><span>${esc(p.status)}</span><span>${esc(p.latestRelease)}</span><span>${platforms(p.platforms)}</span>${p.verified ? `<span>${ic("shield-check")}verified</span>` : ""}</div>
          <div style="border:1.5px solid var(--line-strong)">${C_.visual(p) || ""}</div>
          <p class="b-prose" style="font-size:17px">${esc(p.description)}</p>
          <section class="c-section" aria-labelledby="c-rel"><h2 id="c-rel" class="c-h2">Releases</h2>${p.releases.length ? `<ul class="c-list">${p.releases.map((r) => `<li><span class="c-label">${esc(r.date)}</span><span><strong class="mono">${esc(r.v)}</strong><br><span class="sec">${esc(r.notes)}</span></span><span></span></li>`).join("")}</ul>` : `<p class="empty">No releases published here yet.</p>`}</section>
          <section class="c-section" aria-labelledby="c-fb"><h2 id="c-fb" class="c-h2">Published feedback</h2>${fb.length ? `<ul class="c-list">${fb.map((f) => `<li><span class="c-label">#${f.id}</span><span><strong>${esc(f.title)}</strong><br><span class="sec">${esc(f.type)} · ${esc(U(f.author).name)}</span></span>${fbStatus(f)}</li>`).join("")}</ul>` : `<p class="empty">Nothing published yet.</p>`}</section>
        </div>
        <aside class="c-sticky" aria-label="Take part">
          ${c ? `<section class="c-box" aria-labelledby="c-tt"><span class="c-label">Test campaign</span><h2 id="c-tt"><a href="${href("campaign", c.id)}">${esc(c.title)}</a></h2>${campStatus(c)}${meter(c.testers, c.target, "Testers")}<span class="c-label num">${c.testers}/${c.target} testers · ${c.daysLeft} days left</span>${joinButton(c)}</section>` : `<section class="c-box"><span class="c-label">Test campaign</span><p>No campaign is running. Follow to hear about the next one.</p></section>`}
          <section class="c-box" aria-labelledby="c-mb"><h2 id="c-mb">Maintained by</h2>${p.maintainers.map((id) => `<a class="b-person" href="${href("profile", id)}">${avatar(U(id))}<span><strong>${esc(U(id).name)}</strong><small class="muted">${esc(U(id).location)}</small></span></a>`).join("")}${followButton(p.id)}${p.repo ? `<a href="#" data-act="ext" class="mono">${esc(p.repo)} ${ic("arrow-square-out")}</a>` : ""}</section>
        </aside></div>`;
    },
    campaign(c) {
      const p = P(c.project); const fb = feedbackOf(c.id);
      return `<div class="c-proj"><div class="c-section" style="min-width:0">
          <span class="c-label">Test campaign · <a href="${href("project", p.id)}">${esc(p.name)}</a></span>
          <h1 class="c-ptitle">${esc(c.title)}</h1><p class="c-tagline">${esc(c.summary)}</p>
          <div class="c-strip"><span>${esc(c.version)}</span><span>${esc(c.method)}</span><span>${esc(c.visibility)}</span><span>${esc(c.starts)} → ${esc(c.ends)}</span></div>
          ${c.tasks.length ? `<section class="c-section" aria-labelledby="c-tasks"><h2 id="c-tasks" class="c-h2">Tasks</h2><ol class="c-steps">${c.tasks.map((t) => `<li class="${t.status === "Completed" ? "done" : ""}"><span class="n">${t.id}</span><span>${esc(t.title)}${t.note ? `<br><span class="c-label">${esc(t.note)}</span>` : ""}</span>${taskStatus(t)}</li>`).join("")}</ol></section>` : ""}
          <section class="c-section" aria-labelledby="c-chg"><h2 id="c-chg" class="c-h2">What changed</h2><ul style="padding-left:20px;display:grid;gap:4px">${c.changelog.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
          <section class="c-section" aria-labelledby="c-cfb"><h2 id="c-cfb" class="c-h2">Feedback</h2>${fb.length ? `<ul class="c-list">${fb.map((f) => `<li><span class="c-label">#${f.id}</span><span><strong>${esc(f.title)}</strong><br><span class="sec">${esc(f.type)} · ${esc(U(f.author).name)} · ${esc(f.os)}</span></span>${fbStatus(f)}</li>`).join("")}</ul><p class="c-label">Unpublished reports are visible to the reporter and the maintainers only.</p>` : `<p class="empty">No published feedback yet.</p>`}</section>
        </div>
        <aside class="c-sticky" aria-label="Take part">
          <section class="c-box" aria-labelledby="c-part"><h2 id="c-part">Take part</h2>${campStatus(c)}${meter(c.testers, c.target, "Testers")}<span class="c-label num">${c.testers}/${c.target} testers · ${c.daysLeft} days left</span>${joinButton(c)}<span class="c-label">${esc(c.participation)}</span></section>
          <section class="c-box" aria-labelledby="c-need"><h2 id="c-need">You need</h2><div class="chips">${c.platforms.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div><ul style="padding-left:18px;display:grid;gap:4px">${c.requirements.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${c.downloads.map((d) => `<a href="#" data-act="ext" class="btn">${ic("download-simple")}${esc(d.label)}</a>`).join("")}<p class="ext-note">${ic("warning")}Official project sources only. A warning appears before you leave.</p></section>
        </aside></div>`;
    },
    profile(u) {
      const fb = feedbackBy(u.id);
      return `<div class="c-section"><span class="c-label">${esc(u.role)} · ${esc(u.location)} · since ${esc(u.joined)}</span><h1 class="c-ptitle">${esc(u.name)}</h1><p class="c-tagline">${esc(u.bio)}</p></div>
        <div class="c-figs"><div><strong>${u.stats.campaigns}</strong><span class="c-label">campaigns</span></div><div><strong>${u.stats.reports}</strong><span class="c-label">reports</span></div><div><strong>${Math.round((u.stats.confirmed / u.stats.reports) * 100)}%</strong><span class="c-label">confirmed</span></div></div>
        <section class="c-section" aria-labelledby="c-bench"><h2 id="c-bench" class="c-h2">Test bench</h2><div class="c-devices">${u.devices.map((d) => { const [os, hw] = d.split(" · "); return `<div class="c-device">${ic("monitor", "lg")}<span><strong>${esc(os)}</strong><br><span class="c-label">${esc(hw || "")}</span></span></div>`; }).join("")}</div></section>
        ${u.recognitions ? `<section class="c-section" aria-labelledby="c-rec"><h2 id="c-rec" class="c-h2">Recognitions</h2><ul class="c-list">${u.recognitions.map((r) => `<li><span class="c-label">${ic("shield-check")}</span><span><strong>${esc(r.name)}</strong><br><span class="sec">${esc(r.reason)}</span></span><span></span></li>`).join("")}</ul></section>` : ""}
        <section class="c-section" aria-labelledby="c-rep"><h2 id="c-rep" class="c-h2">Reports</h2>${fb.length ? `<ul class="c-list">${fb.map((f) => `<li><span class="c-label">#${f.id}</span><span><strong>${esc(f.title)}</strong><br><span class="sec">${esc(P(C(f.campaign).project).name)}</span></span>${fbStatus(f)}</li>`).join("")}</ul>` : `<p class="empty">No published reports yet.</p>`}</section>`;
    },
  };

  const CONCEPTS = { a: A, b: B, c: C_ };

  // ---------------------------------------------------------------- concept notes (for the project owner, German)
  const NOTES = {
    a: ["A – Developer Workbench", [["Grundidee", "Werkzeug für Leute, die täglich viele Projekte, Kampagnen und Meldungen bearbeiten."], ["Typografie", "Source Sans 3 (14 px) für dichte Listen, JetBrains Mono für Versionen, IDs und Umgebungen."], ["Farbe", "Graphit mit einem gedeckten Blaugrün als einzigem Akzent; Status über Icon + Text."], ["Layout & Navigation", "Seitenleiste (gedimmt) + Hauptbereich; Tabellen, Detail-Panels; Breadcrumbs."], ["Mobil", "Seitenleiste wird zum Menü; Tabellen scrollen horizontal."], ["Stärken / Schwächen", "Effizient, präzise, wartbar – wirkt für Gelegenheits-Tester eher wie Arbeitssoftware."]]],
    b: ["B – Open-Source Community", [["Grundidee", "Menschen, Projekte und Testaktivität als lesbarer Strom – sozial, aber ohne Ranking."], ["Typografie", "Atkinson Hyperlegible Next (16–17 px) für hohe Lesbarkeit; Mono nur für Versionen."], ["Farbe", "Kühles Off-White bzw. Anthrazit mit Waldgrün; Personen rund, Projekte eckig."], ["Layout & Navigation", "Linke Navigation, Lesespalte, rechte Kontextspalte; flache Diskussionen mit Zitaten."], ["Mobil", "Untere Tab-Leiste, eine Spalte."], ["Stärken / Schwächen", "Lesbar, zugänglich, fair zu kleinen Projekten – weniger dicht für Maintainer."]]],
    c: ["C – Independent Software Community", [["Grundidee", "Software als Regal: Entdecken über Bilder, Terminal-Ausgaben und starke Typografie."], ["Typografie", "Hanken Grotesk (grosse Projektnamen), IBM Plex Mono für Metadaten-Leisten."], ["Farbe", "Tinte und Weiss mit Kobaltblau als Signal; kräftige Rahmen statt Schatten."], ["Layout & Navigation", "Horizontale Navigation, Regale mit unterschiedlich breiten Kacheln, fixiertes Teilnahme-Panel."], ["Mobil", "Navigation scrollt horizontal, Kacheln stapeln sich."], ["Stärken / Schwächen", "Eigenständig und attraktiv – bevorzugt optisch polierte Projekte; Quayside ohne Screenshot zeigt das Risiko."]]],
  };

  // ---------------------------------------------------------------- rendering
  function protoBar() {
    const seg = (act, items, cur) => `<span class="seg" role="group">${items.map(([v, l]) => `<button data-act="${act}" data-value="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</span>`;
    return `<strong>Prototyp</strong><span class="label">Konzept</span>${seg("concept", [["a", "A Workbench"], ["b", "B Community"], ["c", "C Independent"]], state.concept)}
      <span class="label">Gewählt: A · B und C zum Vergleich</span>
      <span class="grow"></span><button class="notes-btn" data-act="notes" aria-expanded="${state.notes}" aria-controls="notes">Konzept-Notizen</button>`;
  }
  function notesHtml() {
    const [title, rows] = NOTES[state.concept];
    return `<div class="notes-inner"><h2>${esc(title)}</h2>${rows.map(([k, v]) => `<dl style="margin:0"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></dl>`).join("")}</div>`;
  }
  /* Private campaigns behave like missing ones for people who are not invited (404, not 403). */
  const visibleCampaign = (id) => { const c = C(id); return c && (c.visibility === "Public" || state.joined.has(c.id)) ? c : null; };
  const notFound = () => `<section class="empty" style="display:grid;gap:8px;padding:40px 0"><h1 style="font-size:24px">Page not found</h1><p>This page does not exist, or you do not have access to it.</p><p><a href="${href("discover")}">Go to Discover</a></p></section>`;

  function pageHtml() {
    const R = CONCEPTS[state.concept];
    switch (state.page) {
      case "discover": return R.discover();
      case "testing": return R.testing();
      case "projects": return R.projects();
      case "project": return P(state.id) ? R.project(P(state.id)) : notFound();
      case "campaign": return visibleCampaign(state.id) ? R.campaign(visibleCampaign(state.id)) : notFound();
      case "profile": return U(state.id) ? R.profile(U(state.id)) : notFound();
      default: return R.home();
    }
  }
  function titleFor() {
    const map = { home: "Home", discover: "Discover", testing: "Testing", projects: "Your projects" };
    const name = state.page === "project" ? P(state.id)?.name : state.page === "campaign" ? visibleCampaign(state.id)?.title : state.page === "profile" ? U(state.id)?.name : map[state.page];
    return `${name || "Page not found"} · Concept ${state.concept.toUpperCase()}`;
  }

  function render(opts = {}) {
    const root = document.documentElement;
    root.dataset.concept = state.concept;
    if (state.theme === "system") delete root.dataset.theme; else root.dataset.theme = state.theme;
    document.getElementById("proto").innerHTML = protoBar();
    const notes = document.getElementById("notes");
    notes.hidden = !state.notes; notes.innerHTML = state.notes ? notesHtml() : "";
    document.getElementById("app").innerHTML = CONCEPTS[state.concept].shell(pageHtml());
    document.getElementById("live").textContent = titleFor();
    if (opts.focusMain) document.getElementById("main")?.focus({ preventScroll: true });
    if (opts.focusId) {
      const el = document.getElementById(opts.focusId);
      if (el) { el.focus(); if (el.setSelectionRange && el.type === "search") el.setSelectionRange(el.value.length, el.value.length); }
    }
  }
  function renderResults() {
    const el = document.getElementById("results");
    if (!el) return;
    const R = CONCEPTS[state.concept]; const list = filteredProjects();
    el.innerHTML = state.concept === "a" ? R.projectTable(list) : state.concept === "b" ? R.entries(list) : R.results(list);
  }

  function parseHash() {
    const raw = decodeURIComponent(location.hash.slice(1));
    const m = raw.match(/^([abc])-([a-z]+)(?:-(.+))?$/);
    if (m && PAGES.includes(m[2])) { state.concept = m[1]; state.page = m[2]; state.id = m[3] || (m[2] === "profile" ? DATA.me : null); }
    else { state.page = "home"; state.id = null; }
  }
  function go(page, id) { const h = href(page, id); if (location.hash === h) render({ focusMain: true }); else location.hash = h; }

  // ---------------------------------------------------------------- events
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-act]");
    if (!t) {
      if (state.menu && !ev.target.closest(".a-side")) { state.menu = false; render(); }
      if (state.notifOpen && !ev.target.closest(".a-notif")) { state.notifOpen = false; render(); }
      return;
    }
    const act = t.dataset.act;
    if (act === "concept") { state.concept = t.dataset.value; state.tabs = {}; location.hash = href(state.page, state.id); return; }
    if (act === "theme") { state.theme = t.dataset.value; store.set("proto-theme", state.theme); render(); return; }
    if (act === "notes") { state.notes = !state.notes; render(); return; }
    if (act === "menu") { state.menu = !state.menu; render(); return; }
    if (act === "tab") { state.tabs[t.dataset.group] = t.dataset.key; render({ focusId: t.id }); return; }
    if (act === "feedtab") { state.feedTab = t.dataset.key; render(); return; }
    if (act === "follow") {
      ev.preventDefault(); const id = t.dataset.id; const on = !state.follows.has(id);
      on ? state.follows.add(id) : state.follows.delete(id); render(); toast(on ? `Following ${P(id).name}` : `Stopped following ${P(id).name}`); return;
    }
    if (act === "join") {
      const c = C(t.dataset.id);
      if (c.participation === "After approval") { state.requested.add(c.id); toast("Request sent. The maintainers will review it."); }
      else { state.joined.add(c.id); toast(`You joined “${c.title}”.`); }
      render(); return;
    }
    if (act === "chip") { const k = t.dataset.key; const v = t.dataset.value; state.f[k] = state.f[k] === v ? "" : v; render(); return; }
    if (act === "filter-toggle") { state.f.active = !state.f.active; render(); return; }
    if (act === "notif") { state.notifOpen = !state.notifOpen; render({ focusId: undefined }); document.querySelector('[data-act="notif"]')?.focus(); return; }
    if (act === "notif-read") { state.notifications.forEach((n) => { n.unread = false; }); render(); document.querySelector('[data-act="notif"]')?.focus(); return; }
    if (act === "notif-go") { const n = state.notifications.find((x) => x.id === Number(t.dataset.id)); if (n) n.unread = false; state.notifOpen = false; return; }
    if (act === "report") { document.getElementById("report-dialog")?.showModal(); document.getElementById("rf-title")?.focus(); return; }
    if (act === "report-close") { document.getElementById("report-dialog")?.close(); return; }
    if (act === "ext") { ev.preventDefault(); toast("Prototype: here you would see a warning before leaving for the external site."); }
  });
  document.addEventListener("submit", (ev) => {
    if (ev.target.id !== "report-form") return;
    ev.preventDefault();
    const form = ev.target; const data = new FormData(form); const title = String(data.get("title") || "").trim();
    const err = document.getElementById("rf-title-err"); const input = document.getElementById("rf-title");
    if (!title) { err.hidden = false; input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", "rf-title-err"); input.focus(); return; }
    const id = Math.max(...DATA.feedback.map((f) => f.id)) + 1;
    DATA.feedback.unshift({ id, campaign: form.dataset.campaign, type: String(data.get("type")), title, author: DATA.me, status: "New", published: false,
      os: String(data.get("env")).split(" · ")[0], version: String(data.get("version")), comments: 0, when: "just now" });
    document.getElementById("report-dialog").close(); render();
    toast(`Report #${id} sent. It stays private until a maintainer publishes it.`);
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.dataset.act === "filter") { state.f[t.dataset.key] = t.type === "checkbox" ? t.checked : t.value; render({ focusId: t.id }); }
    if (t.dataset.act === "radio") { state.f[t.dataset.key] = t.value; render(); document.querySelector(`input[name="${t.name}"][value="${CSS.escape(t.value)}"]`)?.focus(); }
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id !== "q") return;
    state.f.q = ev.target.value;
    if (state.page !== "discover") { location.hash = href("discover"); return; }
    renderResults();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && !/input|select|textarea/i.test(document.activeElement?.tagName || "")) { ev.preventDefault(); document.getElementById("q")?.focus(); return; }
    if (ev.key === "Escape" && state.menu) { state.menu = false; render(); return; }
    if (ev.key === "Escape" && state.notifOpen) { state.notifOpen = false; render(); document.querySelector('[data-act="notif"]')?.focus(); return; }
    const tab = ev.target.closest?.('[role="tab"]');
    if (tab && (ev.key === "ArrowRight" || ev.key === "ArrowLeft" || ev.key === "Home" || ev.key === "End")) {
      ev.preventDefault();
      const all = [...tab.parentElement.querySelectorAll('[role="tab"]')]; let i = all.indexOf(tab);
      i = ev.key === "Home" ? 0 : ev.key === "End" ? all.length - 1 : (i + (ev.key === "ArrowRight" ? 1 : -1) + all.length) % all.length;
      state.tabs[all[i].dataset.group] = all[i].dataset.key; render({ focusId: all[i].id });
    }
  });
  window.addEventListener("hashchange", () => { parseHash(); state.menu = false; const keepSearch = state.page === "discover" && document.activeElement?.id === "q"; render(keepSearch ? { focusId: "q" } : { focusMain: true }); if (!keepSearch) window.scrollTo(0, 0); });

  parseHash();
  render({ focusId: state.page === "discover" && state.f.q ? "q" : undefined });
})();
