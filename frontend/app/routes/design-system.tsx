/**
 * Living reference of the design system (docs/DESIGN-SYSTEM.md). Developer documentation, not
 * product UI – its texts are therefore not in the translation files. Examples use fictional data.
 */
import { data, useSearchParams } from "react-router";

import type { Route } from "./+types/design-system";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Avatar, Chips, FactList, KeyFigures, ProjectIcon, Progress, RowList } from "~/components/ui/Data";
import { EmptyState } from "~/components/ui/EmptyState";
import { CheckboxField, CheckboxGroup, ChoiceGroup, FormNote, SelectField, TextAreaField, TextField } from "~/components/ui/Form";
import {
  ArrowSquareOutIcon,
  BugIcon,
  CheckIcon,
  CursorClickIcon,
  DevicesIcon,
  DownloadSimpleIcon,
  FlaskIcon,
  LightbulbIcon,
  ChatTextIcon,
  LockSimpleIcon,
  PaperclipIcon,
  PlusIcon,
  TagIcon,
} from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { QrCode } from "~/components/ui/QrCode";
import { Panel } from "~/components/ui/Panel";
import { StatusPill } from "~/components/ui/StatusPill";
import { CAMPAIGN_STATUS, FEEDBACK_STATUS, PROJECT_STATUS, TASK_STATUS } from "~/components/ui/statuses";
import { TabNav } from "~/components/ui/TabNav";
import { brand } from "~/config/brand";
import { cacheHeadersFor } from "~/lib/http";

import styles from "./design-system.module.css";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Design system · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return data(null, { headers: cacheHeadersFor(request) });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

const COLOURS = [
  ["bg", "--color-bg"], ["surface", "--color-surface"], ["sunken", "--color-surface-sunken"], ["line", "--color-line"],
  ["fg", "--color-fg"], ["fgSecondary", "--color-fg-secondary"], ["fgMuted", "--color-fg-muted"], ["accent", "--color-accent"],
  ["ok", "--color-ok"], ["warn", "--color-warn"], ["danger", "--color-danger"], ["info", "--color-info"],
] as const;

const TYPE = [
  ["page", "Page title · 28px bold", "Sync engine rewrite"],
  ["section", "Section · 20px bold", "Feedback from testers"],
  ["panel", "Panel title · 16px bold", "Participation"],
  ["body", "Body · 14.5px", "Install the beta next to your current version and import an OPML file."],
  ["sec", "Secondary · 13.5px", "Tidewater · Desktop & mobile app · Linux, Android"],
  ["meta", "Meta · 12.5px", "3 hours ago · #214"],
] as const;

const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug", icon: BugIcon },
  { value: "ux", label: "UX", icon: CursorClickIcon },
  { value: "feature", label: "Feature", icon: LightbulbIcon },
  { value: "compat", label: "Compatibility", icon: DevicesIcon },
  { value: "general", label: "General", icon: ChatTextIcon },
];

export default function DesignSystem() {
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? "tasks";

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Home", to: "/" }, { label: "Design system" }]}
        title="Design system"
        subtitle="Building blocks of the Developer Workbench direction. Examples use fictional data."
        meta={
          <>
            <span>Source Sans 3 · JetBrains Mono · Phosphor Icons</span>
            <span>Tokens: light and dark</span>
          </>
        }
      />

      <Panel title="Colour tokens" aside="Switch the theme in the top bar">
        <ul className={styles.swatches}>
          {COLOURS.map(([cls, token]) => (
            <li key={token} className={styles.swatchItem}>
              <span className={`${styles.swatch} ${styles[cls]}`} aria-hidden="true" />
              <code>{token}</code>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Type scale">
        <dl className={styles.type}>
          {TYPE.map(([cls, label, sample]) => (
            <div key={cls} className={styles.typeRow}>
              <dt className={styles.typeLabel}>{label}</dt>
              <dd className={styles[`t_${cls}`]}>{sample}</dd>
            </div>
          ))}
          <div className={styles.typeRow}>
            <dt className={styles.typeLabel}>Mono · versions, IDs</dt>
            <dd>
              <code>0.9.0-beta.2</code> · <code>#214</code> · <code>Fedora 41</code>
            </dd>
          </div>
        </dl>
      </Panel>

      <div className={styles.grid}>
        <Panel title="Buttons">
          <div className={styles.row}>
            <Button variant="primary" icon={BugIcon}>Report feedback</Button>
            <Button icon={PlusIcon}>Join campaign</Button>
            <Button variant="quiet">Cancel</Button>
            <Button variant="danger">Delete account</Button>
          </div>
          <div className={styles.row}>
            <Button size="sm" icon={DownloadSimpleIcon}>Download</Button>
            <Button aria-pressed="true" icon={CheckIcon}>Following</Button>
            <Button disabled>Campaign is full</Button>
            <ButtonLink to="/design-system?tab=details" preventScrollReset icon={ArrowSquareOutIcon}>Link</ButtonLink>
          </div>
        </Panel>

        <Panel title="Key figures and progress">
          <KeyFigures items={[{ value: 18, of: 40, label: "testers" }, { value: 14, label: "days left" }, { value: 2, of: 5, label: "your tasks" }]} />
          <Progress value={18} max={40} label="Testers joined" />
        </Panel>
      </div>

      <Panel title="Status">
        <div className={styles.statusGroups}>
          {[
            ["Campaign", CAMPAIGN_STATUS],
            ["Feedback", FEEDBACK_STATUS],
            ["Task", TASK_STATUS],
            ["Project", PROJECT_STATUS],
          ].map(([name, map]) => (
            <div key={name as string} className={styles.statusGroup}>
              <p className={styles.typeLabel}>{name as string}</p>
              <div className={styles.row}>
                {Object.entries(map as Record<string, { tone: "ok" | "warn" | "danger" | "info" | "neutral"; icon?: typeof CheckIcon }>).map(([label, s]) => (
                  <StatusPill key={label} tone={s.tone} icon={s.icon} label={label} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className={styles.grid}>
        <Panel title="Rows" aside="2 of 3" flush>
          <RowList
            rows={[
              { key: "1", icon: FlaskIcon, primary: <a href="#rows">Sync engine rewrite</a>, secondary: "Tidewater · 0.9.0-beta.2", trailing: <StatusPill tone="ok" icon={CAMPAIGN_STATUS.Open.icon} label="Open" /> },
              { key: "2", icon: BugIcon, primary: "Sync stops after importing 300+ feeds", secondary: "#214 · Bug Report · Fedora 41", trailing: <StatusPill tone="warn" label="Confirmed" /> },
              { key: "3", icon: TagIcon, primary: "2.0.0-rc.1", secondary: "New editor core, graph view", trailing: "4 hours ago" },
            ]}
          />
        </Panel>

        <Panel title="Identity and facts">
          <div className={styles.row}>
            <Avatar name="Aiko Tanaka" id="aiko" />
            <Avatar name="Mara Lindqvist" id="mara" />
            <ProjectIcon name="Tidewater" id="tidewater" />
            <ProjectIcon name="pgsnap" id="pgsnap" />
            <Avatar name="Priya Raman" id="priya" size="lg" />
          </div>
          <Chips label="Platforms" items={["Fedora 40+", "Ubuntu 24.04+", "Android 12+"]} />
          <FactList items={[{ label: "License", value: <code>GPL-3.0-or-later</code> }, { label: "Platforms", value: "Linux, Android" }, { label: "Languages", value: "Rust, Kotlin" }]} />
        </Panel>
      </div>

      <Panel title="Section navigation">
        <TabNav
          label="Example sections"
          current={tab}
          items={[
            { key: "tasks", label: "Tasks", to: "/design-system?tab=tasks", count: 5 },
            { key: "feedback", label: "Feedback", to: "/design-system?tab=feedback", count: 5 },
            { key: "details", label: "Details", to: "/design-system?tab=details" },
          ]}
        />
        <p className={styles.typeLabel}>Selected: {tab}. Tabs are links: they work without JavaScript and can be bookmarked.</p>
      </Panel>

      <Panel title="Form">
        <form className={styles.form} aria-label="Example report form">
          <ChoiceGroup name="type" legend="Type" options={FEEDBACK_TYPES} defaultValue="bug" />
          <TextField id="ds-title" name="title" label="Title" placeholder="What happened, in one line" />
          <TextField id="ds-title-error" name="title2" label="Title (with error)" defaultValue="" error="Add a title so maintainers can find your report." />
          <TextAreaField id="ds-steps" name="steps" label="Steps to reproduce" hint="Numbered steps help maintainers reproduce the problem." rows={3} />
          <SelectField id="ds-device" name="device" label="Device" options={[{ value: "fedora", label: "Fedora 41 · ThinkPad T14" }, { value: "android", label: "Android 15 · Pixel 7a" }]} />
          <CheckboxGroup
            name="ds-platforms"
            legend="Tested on"
            options={[{ value: "linux", label: "Linux" }, { value: "android", label: "Android" }, { value: "windows", label: "Windows" }]}
            selected={["linux"]}
          />
          <CheckboxField id="ds-public" name="public" label="Publish this report after review" />
          <FormNote icon={PaperclipIcon}>Attachments: PNG, JPEG, WebP, TXT, LOG or JSON. Remove personal data first.</FormNote>
          <FormNote icon={LockSimpleIcon}>Private until a maintainer publishes it.</FormNote>
          <div className={styles.row}>
            <Button variant="primary" type="button">Send report</Button>
            <Button variant="quiet" type="button">Cancel</Button>
          </div>
        </form>
      </Panel>

      <Panel title="QR code" aside="Server-rendered SVG, same in both themes">
        <QrCode value="otpauth://totp/example?secret=EXAMPLEEXAMPLEEX&issuer=Example" label="Example QR code" />
      </Panel>

      <Panel title="Notices">
        <div className={styles.statusGroups}>
          <Notice tone="ok" title="Email address confirmed. You can log in now." />
          <Notice tone="info" title="Signing up is not possible right now.">New accounts are currently not accepted.</Notice>
          <Notice tone="danger" title="The email address or password is incorrect." />
        </div>
      </Panel>

      <div className={styles.grid3}>
        <Panel title="Empty: first use">
          <EmptyState kind="first-use" title="No campaigns yet" action={<Button size="sm" icon={PlusIcon}>Create campaign</Button>}>
            Campaigns organise a test round for one version of your project.
          </EmptyState>
        </Panel>
        <Panel title="Empty: nothing now">
          <EmptyState kind="empty" title="No notifications">You are up to date.</EmptyState>
        </Panel>
        <Panel title="Empty: error">
          <EmptyState kind="error" title="Feedback could not be loaded">Reload the page. If it keeps failing, try again in a few minutes.</EmptyState>
        </Panel>
      </div>
    </>
  );
}
