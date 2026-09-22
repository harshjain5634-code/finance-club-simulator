// Walks every route at several viewports and reports layout, content and console problems.
// Usage (production server on :3100 + headless Chrome on :9333 — see scripts/cdp.mjs):
//   node scripts/route-audit.mjs audit-output
import { mkdirSync, writeFileSync } from "node:fs";
import { openTab, sleep } from "./cdp.mjs";

const OUT = process.argv[2] ?? "audit-output";
mkdirSync(OUT, { recursive: true });

const EVENT = "FINSIM26";
const HOST_EVENT = "/host/events/demo-event";

/** role: PARTICIPANT | HOST | PROJECTOR | ENTRY | UTILITY. mobile: also audited at phone widths. */
export const ROUTES = [
  { path: "/", role: "ENTRY", mobile: true },
  { path: "/join", role: "ENTRY", mobile: true },
  { path: `/join/${EVENT}`, role: "ENTRY", mobile: true },
  { path: "/demo", role: "UTILITY", mobile: true },
  { path: `/event/${EVENT}/dashboard`, role: "PARTICIPANT", mobile: true },
  { path: `/event/${EVENT}/markets`, role: "PARTICIPANT", mobile: true },
  { path: `/event/${EVENT}/markets/NOVA`, role: "PARTICIPANT", mobile: true },
  { path: `/event/${EVENT}/portfolio`, role: "PARTICIPANT", mobile: true },
  { path: `/event/${EVENT}/trade`, role: "PARTICIPANT", mobile: true },
  { path: `/event/${EVENT}/transactions`, role: "PARTICIPANT", mobile: true },
  { path: `/event/${EVENT}/news`, role: "PARTICIPANT", mobile: true },
  { path: `/event/${EVENT}/leaderboard`, role: "PARTICIPANT", mobile: true },
  { path: `/event/${EVENT}/rules`, role: "PARTICIPANT", mobile: true },
  { path: "/host", role: "HOST" },
  { path: "/host/events/new", role: "HOST" },
  { path: HOST_EVENT, role: "HOST" },
  { path: `${HOST_EVENT}/news`, role: "HOST" },
  { path: `${HOST_EVENT}/trades`, role: "HOST" },
  { path: `${HOST_EVENT}/teams`, role: "HOST" },
  { path: `${HOST_EVENT}/teams/team-alpha`, role: "HOST" },
  { path: `${HOST_EVENT}/prices`, role: "HOST" },
  { path: `${HOST_EVENT}/leaderboard`, role: "HOST" },
  { path: `${HOST_EVENT}/display`, role: "HOST" },
  { path: `${HOST_EVENT}/audit`, role: "HOST" },
  { path: `${HOST_EVENT}/exports`, role: "HOST" },
  { path: `${HOST_EVENT}/setup/general`, role: "HOST" },
  { path: `${HOST_EVENT}/setup/instruments`, role: "HOST" },
  { path: `${HOST_EVENT}/setup/allocations`, role: "HOST" },
  { path: `${HOST_EVENT}/setup/rounds`, role: "HOST" },
  { path: `${HOST_EVENT}/setup/review`, role: "HOST" },
  { path: `/event/${EVENT}/projector`, role: "PROJECTOR", stage: true },
];

/** The stage is a fixed 1920x1080 that scales; check it letterboxes cleanly on common venue screens. */
const STAGE_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 2560, height: 1440 },
];
const SCENES = ["round", "leaderboard", "market", "movers", "news", "breaking", "standby", "message", "final"];

const PHONES = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
];

const BAD_TEXT = [/₹\s*undefined/i, /\bNaN\b/, /\bInfinity\b/, /\bundefined\b/, /\[object Object\]/, /-0\.00%/];

const findings = [];
const add = (route, viewport, kind, detail) => {
  findings.push({ route, viewport, kind, detail });
  console.log(`  ! ${kind} @ ${route} ${viewport} — ${String(detail).slice(0, 180)}`);
};

async function auditPage(tab, route, label) {
  const info = await tab.eval(`(() => {
    const text = document.body.innerText;
    const h1 = [...document.querySelectorAll("h1")].map((h) => h.textContent.trim());
    const smallText = [...document.querySelectorAll("p, span, td, th, li, label, div")]
      .filter((el) => el.children.length === 0 && el.textContent.trim().length > 2)
      .map((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), text: el.textContent.trim().slice(0, 40) }))
      .filter((x) => x.size > 0 && x.size < 11);
    const brokenImg = [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src);
    return { len: text.length, text: text.slice(0, 20000), h1, overflow: __overflow(), wide: __overflow() > 1 ? __wideNodes() : [], smallText: smallText.slice(0, 5), smallTargets: __smallTargets(), brokenImg, title: document.title };
  })()`);

  if (info.len < 40 || /Application error|client-side exception|Unhandled Runtime Error/i.test(info.text)) add(route, label, "render", info.text.slice(0, 200));
  if (info.overflow > 1) add(route, label, "horizontal-overflow", `${info.overflow}px · ${info.wide.join(", ")}`);
  if (info.h1.length !== 1) add(route, label, "headings", `${info.h1.length} h1: ${info.h1.join(" | ").slice(0, 120)}`);
  for (const pattern of BAD_TEXT) {
    const match = info.text.match(pattern);
    if (match) {
      const at = info.text.indexOf(match[0]);
      add(route, label, "bad-value", `${match[0]} :: …${info.text.slice(Math.max(0, at - 60), at + 40).replace(/\n/g, " ")}…`);
    }
  }
  if (label !== "1440w" && label !== "1920w" && info.smallTargets.length) add(route, label, "small-tap-target", info.smallTargets.map((t) => `${t.w}x${t.h} "${t.label}"`).join(" · "));
  if (info.smallText.length) add(route, label, "tiny-text", info.smallText.map((s) => `${s.size}px "${s.text}"`).join(" · "));
  if (info.brokenImg.length) add(route, label, "broken-image", info.brokenImg.join(", "));
  if (!info.title || info.title === "Finance Club") add(route, label, "title", info.title ?? "(none)");
  return info;
}

const sink = { errors: {} };

try {
  // Sign a participant tab in so the team routes render real data.
  const tab = await openTab("audit", `/join/${EVENT}?demo=ALPHA`, 1440, 900, sink);
  await tab.waitFor(`location.pathname.includes("/dashboard")`, 15000);

  for (const route of ROUTES) {
    const width = route.stage ? 1920 : 1440;
    const height = route.stage ? 1080 : 900;
    await tab.resize(width, height);
    await tab.go(route.path);
    await auditPage(tab, route.path, `${width}w`);
    if (route.mobile) {
      for (const phone of PHONES) {
        await tab.resize(phone.width, phone.height);
        await tab.go(route.path, 700);
        await auditPage(tab, route.path, `${phone.width}w`);
      }
      await tab.resize(1440, 900);
    }
  }
  // Projector: every scene has to fit the stage at every venue resolution, with nothing clipped.
  for (const size of STAGE_SIZES) {
    await tab.resize(size.width, size.height);
    for (const scene of SCENES) {
      await tab.go(`/event/${EVENT}/projector?scene=${scene}`, 700);
      const fit = await tab.eval(`(() => {
        const stage = document.querySelector('[aria-label^="Projector:"]');
        const main = stage?.querySelector("main");
        if (!main) return { missing: true };
        const overflowing = [...main.querySelectorAll("*")].some((el) => el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow === "visible");
        return { fits: main.scrollHeight <= main.clientHeight + 2, overflowing, label: stage.getAttribute("aria-label") };
      })()`);
      const label = `${size.width}x${size.height}`;
      if (fit.missing) add(`projector?scene=${scene}`, label, "render", "no stage");
      else if (!fit.fits) add(`projector?scene=${scene}`, label, "stage-overflow", `${fit.label} does not fit`);
    }
  }
  await tab.resize(1440, 900);
  await tab.shot(OUT, "last");
} catch (error) {
  add("script", "-", "crash", String(error?.stack ?? error));
}

const consoleIssues = Object.values(sink.errors).flat();
writeFileSync(`${OUT}/route-audit.json`, JSON.stringify({ findings, consoleIssues }, null, 2));
console.log(`\nRoutes audited: ${ROUTES.length} · findings: ${findings.length} · console errors/warnings: ${consoleIssues.length}`);
const byKind = findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
console.log(Object.entries(byKind).map(([k, n]) => `  ${k}: ${n}`).join("\n") || "  (clean)");
for (const issue of consoleIssues.slice(0, 15)) console.log(`  [console ${issue.at}] ${issue.message}`);
await sleep(200);
process.exit(0);
