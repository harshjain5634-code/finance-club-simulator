// Cross-window smoke test driven over the Chrome DevTools Protocol (no extra dependencies).
// Usage (one production server + one headless Chrome; stop both afterwards):
//   npm run build && npx next start -p 3100
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/finsim-smoke about:blank
//   node scripts/browser-smoke.mjs smoke-output
import { mkdirSync, writeFileSync } from "node:fs";

const PORT = 9333;
const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const OUT = process.argv[2] ?? "smoke-output";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { checks: [], errors: {}, screenshots: [] };
const check = (name, ok, detail = "") => {
  results.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

class Tab {
  constructor(name, wsUrl) {
    this.name = name;
    this.id = 0;
    this.pending = new Map();
    this.ws = new WebSocket(wsUrl);
    results.errors[name] = [];
    this.ready = new Promise((resolve) => (this.ws.onopen = resolve));
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      } else if (msg.method === "Runtime.exceptionThrown") {
        results.errors[name].push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        results.errors[name].push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }
  async init(width = 1440, height = 900) {
    await this.ready;
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    // Keep background tabs "focused" so the leader-tab scheduler is not throttled.
    await this.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  }
  async eval(expression) {
    const res = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) throw new Error(`${this.name} eval failed: ${res.result.exceptionDetails.text} :: ${expression.slice(0, 120)}`);
    return res.result?.result?.value;
  }
  async go(path) {
    await this.send("Page.navigate", { url: BASE + path });
    await this.waitFor(`document.readyState === "complete"`, 15000);
    await sleep(900);
    await this.eval(helpers);
  }
  async waitFor(expression, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await this.eval(`Boolean(${expression})`)) return true;
      } catch {}
      await sleep(200);
    }
    return false;
  }
  text() {
    return this.eval(`document.body.innerText`);
  }
  async shot(label) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const file = `${OUT}/${label}.png`;
    writeFileSync(file, Buffer.from(res.result.data, "base64"));
    results.screenshots.push(file);
  }
}

const helpers = `
  window.__scope = (scope) => (scope === "dialog" ? document.querySelector('[role="dialog"]') : document);
  window.__click = (text, scope) => {
    const root = __scope(scope);
    if (!root) return false;
    const candidates = [...root.querySelectorAll("button, a")].filter((el) => el.textContent.replace(/\\s+/g, " ").trim().includes(text) && !el.disabled);
    const el = candidates[candidates.length - 1];
    if (!el) return false;
    el.click();
    return true;
  };
  window.__clickExact = (text, scope) => {
    const root = __scope(scope);
    if (!root) return false;
    const el = [...root.querySelectorAll("button, a, [role=radio]")].find((node) => node.textContent.replace(/\\s+/g, " ").trim() === text && !node.disabled);
    if (!el) return false;
    el.click();
    return true;
  };
  window.__store = () => JSON.parse(localStorage.getItem("finsim:store"));
  window.__demo = () => window.__store().events["demo-event"];
  window.__setInput = (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  window.__stageLabel = () => document.querySelector('[aria-label^="Projector:"]')?.getAttribute("aria-label") ?? "";
  true;
`;

const SCENE_LABEL = { STANDBY: "Standby", ROUND_STATUS: "Round status", LEADERBOARD: "Leaderboard", MARKET_BOARD: "Market board", TOP_MOVERS: "Top movers", NEWS_WALL: "News", CUSTOM_MESSAGE: "Custom message", FINAL_RESULTS: "Final results" };

async function openTab(name, path, width, height) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + path)}`, { method: "PUT" });
  const target = await res.json();
  const tab = new Tab(name, target.webSocketDebuggerUrl);
  await tab.init(width, height);
  await tab.go(path);
  return tab;
}

const noAppError = async (tab, label) => {
  const text = await tab.text();
  const ok = !/Application error|client-side exception|Unhandled Runtime Error/i.test(text) && text.trim().length > 40;
  check(`renders ${label}`, ok, ok ? "" : text.slice(0, 160));
};

const confirmInDialog = async (tab, label) => {
  await tab.waitFor(`document.querySelector('[role="dialog"]')`);
  await sleep(150);
  return tab.eval(`__click(${JSON.stringify(label)}, "dialog")`);
};

try {
  // Entry pages
  const host = await openTab("host", "/", 1440, 900);
  await noAppError(host, "/");
  await host.shot("01-landing");
  for (const path of ["/join", "/join/FINSIM26", "/demo", "/host", "/host/events/new"]) {
    await host.go(path);
    await noAppError(host, path);
  }
  await host.shot("02-demo-or-wizard");

  // Host control room, then teams and projector in separate tabs (same profile → shared localStorage + BroadcastChannel)
  await host.go("/host/events/demo-event");
  check("host control room shows setup checklist", await host.waitFor(`document.body.innerText.includes("Before you go live")`));
  await host.shot("03-host-control-room-setup");

  const alpha = await openTab("alpha", "/join/FINSIM26?demo=ALPHA", 1440, 900);
  check("alpha auto sign-in reaches dashboard", await alpha.waitFor(`location.pathname === "/event/FINSIM26/dashboard" && document.body.innerText.includes("Net worth")`, 15000));
  check("alpha sees first-entry onboarding", await alpha.waitFor(`document.querySelector('[role="dialog"]')?.innerText.includes("Watch the news")`));
  await alpha.shot("04-alpha-onboarding");
  await alpha.eval(`__clickExact("Skip", "dialog")`);
  check("onboarding dismissed and remembered", await alpha.waitFor(`!document.querySelector('[role="dialog"]') && localStorage.getItem("finsim:onboarded:demo-event:team-alpha") === "done"`));
  await alpha.go("/event/FINSIM26/dashboard");
  check("onboarding does not return after reload", !(await alpha.waitFor(`document.querySelector('[role="dialog"]')`, 1500)));

  const beta = await openTab("beta", "/join/FINSIM26?demo=BETA", 1440, 900);
  check("beta auto sign-in reaches dashboard", await beta.waitFor(`document.body.innerText.includes("Trading as") && document.body.innerText.includes("Beta Street")`, 15000));
  await beta.waitFor(`document.querySelector('[role="dialog"]')`, 4000);
  await beta.eval(`__clickExact("Start trading", "dialog")`);
  check("beta onboarding closed with Start trading", await beta.waitFor(`!document.querySelector('[role="dialog"]')`));

  const projector = await openTab("projector", "/event/FINSIM26/projector", 1920, 1080);
  check("projector shows standby before start", await projector.waitFor(`document.body.innerText.toUpperCase().includes("EVENT CODE") && document.body.innerText.includes("FINSIM26")`));
  await projector.shot("05-projector-standby");

  // Start event → briefing → trading round (status bar controls)
  await host.eval(`__click("Start event")`);
  await confirmInDialog(host, "Start event");
  check("event started", await host.waitFor(`__demo().event.status === "LIVE"`));
  await sleep(600);
  await host.eval(`__click("Start briefing")`);
  await confirmInDialog(host, "Start briefing");
  check("briefing round running", await host.waitFor(`__demo().rounds[0].status === "RUNNING"`));
  check("alpha dashboard explains the briefing (cross-tab sync)", await alpha.waitFor(`document.body.innerText.includes("Briefing: read the news")`));
  await host.eval(`__click("Next round")`);
  await confirmInDialog(host, "start R1");
  check("round 1 running", await host.waitFor(`__demo().rounds[1].status === "RUNNING"`));
  await sleep(800);
  await host.shot("06-host-control-room-live");

  // Alpha proposes SELL 20 NOVA @ 525 to Beta through the UI
  await alpha.go("/event/FINSIM26/trade");
  await alpha.waitFor(`document.querySelector("#trade-price")`);
  await alpha.eval(`__setInput("#trade-price", "525")`);
  await alpha.eval(`__setInput("#trade-qty", "20")`);
  await sleep(400);
  const proposeLabel = await alpha.eval(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("Send proposal to"))?.textContent`);
  check("alpha proposal form ready", proposeLabel === "Send proposal to Beta Street", proposeLabel ?? "");
  await alpha.eval(`__click("Send proposal to")`);
  check("proposal stored as PROPOSED", await alpha.waitFor(`__demo().proposals.some(p => p.status === "PROPOSED" && p.price === 52500 && p.quantity === 20 && p.counterpartyTeamId === "team-beta")`));
  await alpha.shot("07-alpha-trade-proposed");

  // Beta accepts from the UI
  check("beta dashboard shows the incoming proposal", await beta.waitFor(`document.body.innerText.includes("Review proposals")`));
  await beta.go("/event/FINSIM26/trade");
  check("beta sees incoming proposal", await beta.waitFor(`document.body.innerText.includes("Accept & settle")`));
  await beta.shot("08-beta-incoming-proposal");
  await beta.eval(`__click("Accept & settle")`);
  check("trade settled once", await beta.waitFor(`__demo().trades.length === 1`));
  const balances = await beta.eval(`(() => { const s = __demo(); return { alphaNova: s.balances["TEAM:team-alpha"]["INSTRUMENT:ins-nova"], betaNova: s.balances["TEAM:team-beta"]["INSTRUMENT:ins-nova"], alphaCash: s.balances["TEAM:team-alpha"].CASH, betaCash: s.balances["TEAM:team-beta"].CASH }; })()`);
  check("balances moved correctly", balances.alphaNova === 180 && balances.betaNova === 220 && balances.alphaCash === 50520000 + 1050000 && balances.betaCash === 50520000 - 1050000, JSON.stringify(balances));

  // Host releases the Nova story from the news desk → breaking news everywhere
  await host.go("/host/events/demo-event/news");
  await host.waitFor(`document.body.innerText.includes("Nova Motors secures")`);
  await host.shot("09-host-news-desk");
  await host.eval(`(() => { const row = [...document.querySelectorAll("li")].find(li => li.innerText.includes("Nova Motors secures")); const button = [...row.querySelectorAll("button")].find(b => b.textContent.trim() === "Release"); button.click(); return true; })()`);
  await host.waitFor(`document.querySelector('[role="dialog"]')?.innerText.includes("Nova Motors")`);
  await host.shot("10-host-release-preview");
  await host.eval(`__click("Release news", "dialog")`);
  check("news released and NOVA repriced", await host.waitFor(`__demo().newsReleases.length === 1 && __demo().prices["ins-nova"].price !== 50000`));
  const nova = await host.eval(`(() => { const r = __demo().newsReleases[0]; return { resolved: r.impacts[0].resolvedPct, price: r.impacts[0].newPrice, source: r.source }; })()`);
  check("resolved impact within +5..+10% and recorded as manual", nova.resolved >= 5 && nova.resolved <= 10 && nova.source === "MANUAL", JSON.stringify(nova));
  const breaking = `document.body.innerText.toUpperCase().includes("BREAKING NEWS") && document.body.innerText.toUpperCase().includes("NOVA MOTORS SECURES")`;
  const [projectorSaw, alphaSaw, betaSaw] = await Promise.all([projector.waitFor(breaking, 6000), alpha.waitFor(breaking, 6000), beta.waitFor(breaking, 6000)]);
  check("projector shows breaking news takeover", projectorSaw);
  check("alpha sees breaking news alert", alphaSaw);
  check("beta sees breaking news alert", betaSaw);
  await Promise.all([projector.shot("11-projector-breaking-news"), alpha.shot("12-alpha-breaking-alert")]);

  // Participant routes (alpha) and a mobile check
  for (const path of ["dashboard", "markets", "markets/NOVA", "portfolio", "transactions", "news", "leaderboard", "rules"]) {
    await alpha.go(`/event/FINSIM26/${path}`);
    await noAppError(alpha, `/event/FINSIM26/${path}`);
    if (path === "dashboard") {
      check("alpha dashboard shows latest news", await alpha.waitFor(`document.body.innerText.includes("Nova Motors secures")`));
      await alpha.shot("13-alpha-dashboard-after-news");
    }
    if (path === "markets/NOVA") await alpha.shot("14-alpha-stock-detail");
    if (path === "portfolio") await alpha.shot("15-alpha-portfolio");
    if (path === "news") await alpha.shot("16-alpha-news");
  }
  await alpha.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await alpha.go("/event/FINSIM26/dashboard");
  const overflow = await alpha.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check("participant dashboard has no horizontal page overflow at 390px", overflow <= 1, `overflow ${overflow}px`);
  await alpha.shot("17-alpha-mobile-dashboard");
  await alpha.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // Host routes
  for (const path of ["teams", "teams/team-alpha", "trades", "news", "prices", "leaderboard", "setup/general", "setup/instruments", "setup/allocations", "setup/rounds", "display", "audit", "exports"]) {
    await host.go(`/host/events/demo-event/${path}`);
    await noAppError(host, `/host/events/demo-event/${path}`);
    if (path === "trades") await host.shot("18-host-trade-monitor");
    if (path === "audit") await host.shot("19-host-audit");
  }
  await host.eval(`__click("Run check")`);
  check("reconciliation passes in exports UI", await host.waitFor(`document.body.innerText.includes("✓ PASS")`));
  await host.shot("20-host-exports-reconciliation");

  check("projector returns to rotation after the takeover", await projector.waitFor(`!document.body.innerText.toUpperCase().includes("BREAKING NEWS")`, 20000));

  // Host projector controls → projector tab follows
  await host.go("/host/events/demo-event/display");
  await host.waitFor(`document.body.innerText.includes("Now showing")`);
  await host.eval(`__clickExact("Next")`);
  check("next scene stored in shared rotation", await host.waitFor(`__demo().event.projector.rotation.anchorScene !== null`));
  const anchored = await host.eval(`__demo().event.projector.rotation.anchorScene`);
  check("projector follows host Next", await projector.waitFor(`__stageLabel() === ${JSON.stringify(`Projector: ${SCENE_LABEL[anchored] ?? "?"}`)}`, 5000), anchored);
  await host.eval(`__clickExact("Pin current")`);
  check("pin current scene", await host.waitFor(`__demo().event.projector.pinnedScene === ${JSON.stringify(anchored)}`));
  await host.eval(`__clickExact("Resume rotation")`);
  check("resume rotation", await host.waitFor(`__demo().event.projector.pinnedScene === null`));
  await host.eval(`__setInput("#projector-message-title", "Round 2 begins in 2 minutes")`);
  await host.eval(`__setInput("#projector-message-body", "Check the latest news and get your trades ready.")`);
  await sleep(200);
  await host.eval(`__clickExact("Show on projector")`);
  check("custom message shown on projector", await projector.waitFor(`document.body.innerText.toUpperCase().includes("ROUND 2 BEGINS IN 2 MINUTES") && document.body.innerText.toUpperCase().includes("ANNOUNCEMENT")`, 5000));
  await Promise.all([projector.shot("21-projector-custom-message"), host.shot("22-host-projector-controls")]);
  await host.eval(`__clickExact("Clear overlay")`);
  check("overlay cleared on projector", await projector.waitFor(`!document.body.innerText.toUpperCase().includes("ROUND 2 BEGINS IN 2 MINUTES")`, 5000));

  // Random news mode from the control room: 30s gap, release now, then an automatic release
  await host.go("/host/events/demo-event");
  await host.eval(`(() => { const group = document.querySelector('[aria-label="News release mode"]'); [...group.querySelectorAll("button")].find(b => b.textContent.trim() === "Random").click(); return true; })()`);
  check("random mode selected", await host.waitFor(`__demo().randomNews.mode === "RANDOM"`));
  await host.waitFor(`document.body.innerText.includes("Start random mode")`);
  await host.eval(`__clickExact("Settings")`);
  await host.waitFor(`document.querySelector("#rn-min")`);
  await host.eval(`__setInput("#rn-min", "30")`);
  await host.eval(`__setInput("#rn-max", "30")`);
  await sleep(200);
  await host.eval(`__clickExact("Save settings", "dialog")`);
  check("random gap saved (30s)", await host.waitFor(`__demo().randomNews.minGapSeconds === 30 && __demo().randomNews.maxGapSeconds === 30`));
  await host.eval(`__clickExact("Start random mode")`);
  check("random mode running with a scheduled story", await host.waitFor(`__demo().randomNews.status === "RUNNING" && __demo().randomNews.nextReleaseAt !== null && __demo().randomNews.scheduledNewsId !== null`));
  check("countdown visible", await host.waitFor(`document.body.innerText.toUpperCase().includes("NEXT RANDOM NEWS") && /in \\d\\d:\\d\\d/.test(document.body.innerText)`));
  await host.shot("23-host-control-room-random");
  await host.eval(`__clickExact("Release now")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__clickExact("Release now", "dialog")`);
  check("random release now", await host.waitFor(`__demo().newsReleases.length === 2 && __demo().newsReleases[1].source === "RANDOM"`));
  const early = await host.eval(`__demo().randomNews.log.at(-1)?.outcome`);
  check("early release logged", early === "RELEASED_EARLY", String(early));
  const autoReleased = await host.waitFor(`__demo().newsReleases.length === 3`, 70000);
  const auto = await host.eval(`(() => { const s = __demo(); const [a, b, c] = s.newsReleases; return c ? { source: c.source, gap: c.releasedAt - b.releasedAt, scheduledFor: c.scheduledFor, late: c.releasedAt - (c.scheduledFor ?? 0), logged: s.randomNews.log.at(-1)?.outcome, next: s.randomNews.nextReleaseAt, roundOk: [b, c].every(r => r.roundId === "round-1") } : null; })()`);
  check("automatic random release", autoReleased && auto?.source === "RANDOM" && auto.logged === "RELEASED", JSON.stringify(auto));
  check("minimum gap respected", Boolean(auto && auto.gap >= 30000 && auto.late >= 0), JSON.stringify(auto));
  check("round 1 stories used up → nothing else scheduled", Boolean(auto && auto.next === null && auto.roundOk), JSON.stringify(auto));
  await host.go("/host/events/demo-event/news");
  await host.shot("24-host-news-desk-random");
  await host.go("/host/events/demo-event");
  await host.eval(`__clickExact("Stop")`);
  check("random mode stopped", await host.waitFor(`__demo().randomNews.status === "STOPPED"`));
  await host.shot("25-host-control-room");

  // Review captures of individual projector scenes (local ?scene= override)
  for (const [scene, label] of [["round", "26-projector-round"], ["leaderboard", "27-projector-leaderboard"], ["market", "28-projector-market-board"], ["movers", "29-projector-movers"], ["news", "30-projector-news"], ["breaking", "31-projector-breaking"]]) {
    await projector.go(`/event/FINSIM26/projector?scene=${scene}`);
    await sleep(700);
    const fits = await projector.eval(`(() => { const main = document.querySelector('[aria-label^="Projector:"] > main'); return main ? main.scrollHeight <= main.clientHeight + 2 : false; })()`);
    check(`projector ${scene} scene fits the stage`, fits);
    await projector.shot(label);
  }
  await projector.go("/event/FINSIM26/projector");

  // Alpha: dashboard + trade screenshots for review
  await alpha.go("/event/FINSIM26/dashboard");
  await alpha.shot("32-alpha-dashboard");
  await alpha.go("/event/FINSIM26/trade");
  await alpha.shot("33-alpha-trade");

  // Emergency freeze through the dialog → team terminal banner → unfreeze
  await host.go("/host/events/demo-event");
  await host.eval(`__click("Freeze trading")`);
  await confirmInDialog(host, "Freeze trading");
  check("freeze via emergency dialog", await host.waitFor(`__demo().event.tradingFrozen === true`));
  check("alpha sees trading frozen banner", await alpha.waitFor(`document.body.innerText.includes("Trading frozen by host.")`));
  await alpha.shot("34-alpha-frozen");
  await host.eval(`__click("Unfreeze trading")`);
  await confirmInDialog(host, "Unfreeze trading");
  check("unfreeze via dialog", await host.waitFor(`__demo().event.tradingFrozen === false`));

  // End event from the event actions menu with typed confirmation → projector final results
  await host.eval(`document.querySelector('[aria-label="Event actions"]').click()`);
  await host.waitFor(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("End event…"))`);
  await host.eval(`__click("End event…")`);
  await host.waitFor(`document.querySelector("#confirm-typed")`);
  const disabledBeforeTyping = await host.eval(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === "End event")?.disabled`);
  check("end event button disabled until typed + reason", disabledBeforeTyping === true);
  await host.eval(`__setInput("#confirm-reason", "Smoke test finished the event")`);
  await host.eval(`__setInput("#confirm-typed", "FINSIM26")`);
  await sleep(300);
  await host.eval(`__clickExact("End event", "dialog")`);
  check("event completed", await host.waitFor(`__demo().event.status === "COMPLETED"`));
  check("projector shows final results", await projector.waitFor(`document.body.innerText.toUpperCase().includes("FINAL RESULTS")`, 8000));
  await projector.shot("35-projector-final-results");

  // Wizard → draft event → apply allocations through the UI
  await host.go("/host/events/new");
  for (let i = 0; i < 4; i++) {
    await host.eval(`__click("Continue")`);
    await sleep(250);
  }
  await host.eval(`__click("Create draft event")`);
  check("wizard creates draft and opens setup", await host.waitFor(`location.pathname.endsWith("/setup/general")`, 8000));
  const newEventId = await host.eval(`location.pathname.split("/")[3]`);
  await host.go(`/host/events/${newEventId}/setup/allocations`);
  await host.eval(`__click("Apply allocations")`);
  await confirmInDialog(host, "Apply allocations");
  check("allocations applied via UI → READY", await host.waitFor(`__store().events["${newEventId}"].event.status === "READY"`));
  await host.shot("36-host-allocations-applied");

  // Load REAL_SIMULATED scenario from the demo launcher → team terminal updates
  await host.go("/demo");
  await host.eval(`__click("Load real-simulated scenario")`);
  await confirmInDialog(host, "Load scenario");
  check("real-simulated scenario loaded", await host.waitFor(`__demo().event.universeMode === "REAL_SIMULATED"`));
  await alpha.go("/event/FINSIM26/markets/RELIANCE");
  check("alpha stock detail shows RELIANCE real-simulated", await alpha.waitFor(`document.body.innerText.includes("Reliance Industries") && document.body.innerText.includes("Real company")`));
  await alpha.shot("37-alpha-reliance-detail");
} catch (error) {
  check("smoke script completed", false, String(error?.stack ?? error));
}

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const errorCount = Object.values(results.errors).reduce((n, list) => n + list.length, 0);
console.log(`\n${results.checks.filter((c) => c.ok).length}/${results.checks.length} checks passed · ${errorCount} console errors`);
for (const [tab, list] of Object.entries(results.errors)) for (const e of list.slice(0, 5)) console.log(`  [${tab}] ${String(e).slice(0, 300)}`);
process.exit(0);
