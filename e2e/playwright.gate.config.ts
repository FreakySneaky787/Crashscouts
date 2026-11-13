import { e2eConfig } from "./playwright.config";

/**
 * Security-gate run (WP 3B.6): the same stack as the main run, but with PUBLIC_CAMPAIGNS_ENABLED
 * on for Django, so the abuse case of gate item 8 runs end to end. Only the tests in ./gate run
 * here; the main run keeps checking that public campaigns are locked. The flag's default stays
 * off everywhere; only the project owner switches it in production.
 */
export default e2eConfig("./gate", { PUBLIC_CAMPAIGNS_ENABLED: "true" });
