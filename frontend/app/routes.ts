import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("signup/check-email", "routes/signup-check-email.tsx"),
  route("verify-email/:key", "routes/verify-email.tsx"),
  route("password/forgot", "routes/password-forgot.tsx"),
  route("password/reset/:key", "routes/password-reset.tsx"),
  route("logout", "routes/logout.tsx"),
  route("account", "routes/account.tsx"),
  route("theme", "routes/theme.tsx"),
  route("design-system", "routes/design-system.tsx"),
  // Test-only probe for the SSR spike (WP 0.4). Always 404 without the probe backend (production).
  route("probe/public/:id", "routes/probe-public.tsx"),
  route("probe/private/:id", "routes/probe-private.tsx"),
] satisfies RouteConfig;
