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
  window.__click = (text, scope) => {
    const root = scope === "dialog" ? document.querySelector('[role="dialog"]') : document;
    if (!root) return false;
    const candidates = [...root.querySelectorAll("button, a")].filter((el) => el.textContent.replace(/\\s+/g, " ").trim().includes(text) && !el.disabled);
    const el = candidates[candidates.length - 1];
    if (!el) return false;
    el.click();
    return true;
  };
  window.__store = () => JSON.parse(localStorage.getItem("finsim:store"));
  window.__demo = () => window.__store().events["demo-event"];
  window.__setInput = (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  true;
`;

async function openTab(name, path, width, height) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + path)}`, { method: "PUT" });
  const target = await res.json();
  const tab = new Tab(name, target.webSocketDebuggerUrl);
  await tab.init(width, height);
  await tab.go(path);
  await tab.eval(helpers);
  return tab;
}

const noAppError = async (tab, label) => {
  const text = await tab.text();
  const ok = !/Application error|client-side exception|Unhandled Runtime Error/i.test(text) && text.trim().length > 40;
  check(`renders ${label}`, ok, ok ? "" : text.slice(0, 160));
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
  await host.eval(helpers);
  check("host control room shows readiness", await host.waitFor(`document.body.innerText.includes("Readiness checklist")`));

  const alpha = await openTab("alpha", "/join/FINSIM26?demo=ALPHA", 1440, 900);
  check("alpha auto sign-in reaches dashboard", await alpha.waitFor(`location.pathname === "/event/FINSIM26/dashboard" && document.body.innerText.includes("Team net worth")`, 15000));
  const beta = await openTab("beta", "/join/FINSIM26?demo=BETA", 1440, 900);
  check("beta auto sign-in reaches dashboard", await beta.waitFor(`document.body.innerText.includes("Trading as") && document.body.innerText.includes("Beta Street")`, 15000));
  const projector = await openTab("projector", "/event/FINSIM26/projector", 1920, 1080);
  check("projector shows standby before start", await projector.waitFor(`document.body.innerText.toUpperCase().includes("EVENT CODE") && document.body.innerText.includes("FINSIM26")`));
  await projector.shot("03-projector-standby");

  // Start event → briefing → trading round
  await host.eval(helpers);
  await host.eval(`__click("Start event")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__click("Start event", "dialog")`);
  check("event started", await host.waitFor(`__demo().event.status === "LIVE"`));
  await sleep(600);
  await host.eval(`__click("Start briefing")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__click("Start briefing", "dialog")`);
  check("briefing round running", await host.waitFor(`__demo().rounds[0].status === "RUNNING"`));
  check("alpha terminal shows briefing banner (cross-tab sync)", await alpha.waitFor(`document.body.innerText.includes("Market briefing.")`));
  await host.eval(`__click("Next round")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__click("start R1", "dialog")`);
  check("round 1 running", await host.waitFor(`__demo().rounds[1].status === "RUNNING"`));
  await sleep(800);
  await host.shot("04-host-control-room-live");

  // Alpha proposes SELL 20 NOVA @ 525 to Beta through the UI
  await alpha.go("/event/FINSIM26/trade");
  await alpha.eval(helpers);
  await alpha.waitFor(`document.querySelector("#trade-price")`);
  await alpha.eval(`__setInput("#trade-price", "525")`);
  await alpha.eval(`__setInput("#trade-qty", "20")`);
  await sleep(400);
  const proposeLabel = await alpha.eval(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("Propose sell"))?.textContent`);
  check("alpha proposal form ready", Boolean(proposeLabel), proposeLabel ?? "");
  await alpha.eval(`__click("Propose sell")`);
  check("proposal stored as PROPOSED", await alpha.waitFor(`__demo().proposals.some(p => p.status === "PROPOSED" && p.price === 52500 && p.quantity === 20 && p.counterpartyTeamId === "team-beta")`));
  await alpha.shot("05-alpha-trade-proposed");

  // Beta accepts from the UI (toast + incoming card)
  await beta.go("/event/FINSIM26/trade");
  await beta.eval(helpers);
  check("beta sees incoming proposal", await beta.waitFor(`document.body.innerText.includes("Accept & settle")`));
  await beta.shot("06-beta-incoming-proposal");
  await beta.eval(`__click("Accept & settle")`);
  check("trade settled once", await beta.waitFor(`__demo().trades.length === 1`));
  const balances = await beta.eval(`(() => { const s = __demo(); return { alphaNova: s.balances["TEAM:team-alpha"]["INSTRUMENT:ins-nova"], betaNova: s.balances["TEAM:team-beta"]["INSTRUMENT:ins-nova"], alphaCash: s.balances["TEAM:team-alpha"].CASH, betaCash: s.balances["TEAM:team-beta"].CASH }; })()`);
  check("balances moved correctly", balances.alphaNova === 180 && balances.betaNova === 220 && balances.alphaCash === 50520000 + 1050000 && balances.betaCash === 50520000 - 1050000, JSON.stringify(balances));

  // Host releases News #3 → breaking news everywhere
  await host.go("/host/events/demo-event");
  await host.eval(helpers);
  await host.waitFor(`document.body.innerText.includes("Preview & release")`);
  await host.eval(`(() => { const buttons = [...document.querySelectorAll("button")].filter(b => b.textContent.includes("Preview & release")); buttons[2].click(); return true; })()`);
  await host.waitFor(`document.querySelector('[role="dialog"]') && document.querySelector('[role="dialog"]').innerText.includes("Nova Motors")`);
  await host.shot("07-host-release-preview");
  await host.eval(`__click("Release news", "dialog")`);
  check("news released and NOVA repriced", await host.waitFor(`__demo().newsReleases.length === 1 && __demo().prices["ins-nova"].price !== 50000`));
  const nova = await host.eval(`(() => { const r = __demo().newsReleases[0].impacts[0]; return { resolved: r.resolvedPct, price: r.newPrice }; })()`);
  check("resolved impact within +5..+10%", nova.resolved >= 5 && nova.resolved <= 10, JSON.stringify(nova));
  const breaking = `document.body.innerText.toUpperCase().includes("BREAKING NEWS") && document.body.innerText.toUpperCase().includes("NOVA MOTORS SECURES")`;
  const [projectorSaw, alphaSaw, betaSaw] = await Promise.all([projector.waitFor(breaking, 6000), alpha.waitFor(breaking, 6000), beta.waitFor(breaking, 6000)]);
  check("projector shows breaking news takeover", projectorSaw);
  check("alpha sees breaking news alert", alphaSaw);
  check("beta sees breaking news alert", betaSaw);
  await Promise.all([projector.shot("08-projector-breaking-news"), alpha.shot("09-alpha-breaking-alert")]);

  // Participant routes (alpha) and a mobile check
  for (const path of ["dashboard", "markets", "markets/NOVA", "portfolio", "transactions", "news", "leaderboard", "rules"]) {
    await alpha.go(`/event/FINSIM26/${path}`);
    await noAppError(alpha, `/event/FINSIM26/${path}`);
    if (path === "dashboard") await alpha.shot("10-alpha-dashboard-after-news");
    if (path === "markets/NOVA") await alpha.shot("11-alpha-stock-detail");
  }
  await alpha.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await alpha.go("/event/FINSIM26/dashboard");
  const overflow = await alpha.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check("participant dashboard has no horizontal page overflow at 390px", overflow <= 1, `overflow ${overflow}px`);
  await alpha.shot("12-alpha-mobile-dashboard");

  // Host routes
  for (const path of ["teams", "teams/team-alpha", "trades", "news", "prices", "leaderboard", "setup/general", "setup/instruments", "setup/allocations", "setup/rounds", "display", "audit", "exports"]) {
    await host.go(`/host/events/demo-event/${path}`);
    await noAppError(host, `/host/events/demo-event/${path}`);
    if (path === "trades") await host.shot("13-host-trade-monitor");
    if (path === "news") await host.shot("14-host-news-desk");
    if (path === "audit") await host.shot("15-host-audit");
  }
  await host.eval(helpers);
  await host.eval(`__click("Run check")`);
  check("reconciliation passes in exports UI", await host.waitFor(`document.body.innerText.includes("✓ PASS")`));
  await host.shot("16-host-exports-reconciliation");

  await projector.waitFor(`!document.body.innerText.toUpperCase().includes("BREAKING NEWS")`, 20000);
  await projector.shot("17-projector-after-takeover");

  // Emergency freeze through the dialog → team terminal banner → unfreeze
  await alpha.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await host.go("/host/events/demo-event");
  await host.eval(helpers);
  await host.eval(`__click("Freeze trading")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__click("Freeze trading", "dialog")`);
  check("freeze via emergency dialog", await host.waitFor(`__demo().event.tradingFrozen === true`));
  check("alpha sees trading frozen banner", await alpha.waitFor(`document.body.innerText.includes("Trading frozen by host.")`));
  await alpha.shot("18-alpha-frozen-banner");
  await host.eval(`__click("Unfreeze trading")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__click("Unfreeze trading", "dialog")`);
  check("unfreeze via dialog", await host.waitFor(`__demo().event.tradingFrozen === false`));

  // End event with typed confirmation → projector final results
  await host.eval(`window.__setTextarea = (selector, value) => { const el = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); return true; }; true`);
  await host.eval(`__click("End event")`);
  await host.waitFor(`document.querySelector("#confirm-typed")`);
  const disabledBeforeTyping = await host.eval(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === "End event")?.disabled`);
  check("end event button disabled until typed + reason", disabledBeforeTyping === true);
  await host.eval(`__setTextarea("#confirm-reason", "Smoke test finished the event")`);
  await host.eval(`__setInput("#confirm-typed", "FINSIM26")`);
  await sleep(300);
  await host.eval(`__click("End event", "dialog")`);
  check("event completed", await host.waitFor(`__demo().event.status === "COMPLETED"`));
  check("projector shows final results", await projector.waitFor(`document.body.innerText.toUpperCase().includes("FINAL RESULTS")`, 8000));
  await projector.shot("19-projector-final-results");

  // Wizard → draft event → apply allocations through the UI
  await host.go("/host/events/new");
  await host.eval(helpers);
  for (let i = 0; i < 4; i++) {
    await host.eval(`__click("Continue")`);
    await sleep(250);
  }
  await host.eval(`__click("Create draft event")`);
  check("wizard creates draft and opens setup", await host.waitFor(`location.pathname.endsWith("/setup/general")`, 8000));
  const newEventId = await host.eval(`location.pathname.split("/")[3]`);
  await host.go(`/host/events/${newEventId}/setup/allocations`);
  await host.eval(helpers);
  await host.eval(`__click("Apply allocations")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__click("Apply allocations", "dialog")`);
  check("allocations applied via UI → READY", await host.waitFor(`__store().events["${newEventId}"].event.status === "READY"`));
  await host.shot("20-host-allocations-applied");

  // Load REAL_SIMULATED scenario from the demo launcher → team terminal updates
  await host.go("/demo");
  await host.eval(helpers);
  await host.eval(`__click("Load real-simulated scenario")`);
  await host.waitFor(`document.querySelector('[role="dialog"]')`);
  await host.eval(`__click("Load scenario", "dialog")`);
  check("real-simulated scenario loaded", await host.waitFor(`__demo().event.universeMode === "REAL_SIMULATED"`));
  await alpha.go("/event/FINSIM26/markets/RELIANCE");
  check("alpha stock detail shows RELIANCE real-simulated", await alpha.waitFor(`document.body.innerText.includes("Reliance Industries") && document.body.innerText.includes("Real company")`));
  await alpha.shot("21-alpha-reliance-detail");
} catch (error) {
  check("smoke script completed", false, String(error?.stack ?? error));
}

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const errorCount = Object.values(results.errors).reduce((n, list) => n + list.length, 0);
console.log(`\n${results.checks.filter((c) => c.ok).length}/${results.checks.length} checks passed · ${errorCount} console errors`);
for (const [tab, list] of Object.entries(results.errors)) for (const e of list.slice(0, 5)) console.log(`  [${tab}] ${String(e).slice(0, 300)}`);
process.exit(0);
