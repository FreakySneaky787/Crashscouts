import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("account", "routes/account.tsx"),
  // Test-only-Probe für den SSR-Durchstich (AP 0.4). Ohne Probe-Backend (Produktion) immer 404.
  route("probe/public/:id", "routes/probe-public.tsx"),
  route("probe/private/:id", "routes/probe-private.tsx"),
] satisfies RouteConfig;
