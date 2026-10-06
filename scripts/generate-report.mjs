import fs from "node:fs/promises";

const data = JSON.parse(await fs.readFile("data.json", "utf8"));
const tasks = Array.isArray(data.tasks) ? data.tasks : [];
const lists = Array.isArray(data.lists) ? data.lists : [];

const closed = t => ["closed","done"].includes(String(t.status_type || "").toLowerCase()) ||
  /^(complete|completed|done|closed)$/i.test(t.status || "");
const active = tasks.filter(t => !closed(t));
const overdue = active.filter(t => t.overdue);
const stale = active.filter(t => Number(t.age_days || 0) >= 7);
const backlog = active.filter(t => /backlog|to do/i.test(t.status || ""));
const flow = active.filter(t => /progress|review|qa|design|release/i.test(t.status || ""));

function product(t) {
  const s = [t.list_name,t.folder_name,t.space_name].filter(Boolean).join(" ").toLowerCase();
  if (/erp|white.?label|whitelabel/.test(s)) return "Deepen ERP";
  if (/deepen|well|ai trainer|deepview|activity|challenge/.test(s)) return "Deepen Well";
  return "Other";
}

function sprintLists() {
  return lists.filter(l => /sprint\s*\d+/i.test(l.name || ""))
    .sort((a,b) => String(b.name).localeCompare(String(a.name), undefined, {numeric:true}))
    .slice(0, 10);
}

const products = ["Deepen ERP","Deepen Well"].map(name => {
  const all = tasks.filter(t => product(t) === name);
  const open = all.filter(t => !closed(t));
  return {name,total:all.length,active:open.length,done:all.length-open.length,overdue:open.filter(t=>t.overdue).length};
});

const sprints = sprintLists().map(l => {
  const all = tasks.filter(t => String(t.list_id) === String(l.id));
  const open = all.filter(t => !closed(t));
  return {name:l.name,total:all.length,active:open.length,done:all.length-open.length,overdue:open.filter(t=>t.overdue).length};
});

const workload = {};
for (const t of active) {
  for (const a of (t.assignees || [])) {
    const name = a.name || a.username || "Unassigned";
    workload[name] ||= {active:0,overdue:0};
    workload[name].active++;
    if (t.overdue) workload[name].overdue++;
  }
}
const team = Object.entries(workload)
  .sort((a,b) => b[1].active-a[1].active)
  .map(([name,v]) => "- " + name + ": " + v.active + " active, " + v.overdue + " overdue");

const risks = [
  ...overdue.slice(0,12).map(t => "- **OVERDUE:** " + t.name + " — " + (t.list_name || "Unknown list")),
  ...stale.slice(0,12).map(t => "- **STALE 7+ DAYS:** " + t.name + " — " + (t.list_name || "Unknown list"))
];

const actions = [];
if (overdue.length) actions.push("Resolve or re-plan " + overdue.length + " overdue open task(s).");
if (stale.length) actions.push("Review " + stale.length + " stale task(s) with no update for 7+ days.");
if (backlog.length) actions.push("Review backlog / To Do queue: " + backlog.length + " active task(s).");
if (flow.length) actions.push("Review delivery-flow queue: " + flow.length + " task(s) in progress/review/QA/design/release.");
if (!actions.length) actions.push("No automatic critical actions detected from current ClickUp data.");

const report = "# Deepen PM Report\n\n"
+ "**Generated:** " + (data.generated_at || new Date().toISOString()) + "\n"
+ "**Source:** " + (data.source || "unknown") + "\n\n"
+ "## 1. Executive Summary\n\n"
+ "- Primary tasks: **" + tasks.length + "**\n"
+ "- Active: **" + active.length + "**\n"
+ "- Completed: **" + (tasks.length-active.length) + "**\n"
+ "- Overdue: **" + overdue.length + "**\n"
+ "- Stale 7+ days: **" + stale.length + "**\n"
+ "- Backlog / To Do: **" + backlog.length + "**\n"
+ "- Delivery flow (progress/review/QA/design/release): **" + flow.length + "**\n\n"
+ "## 2. Product Summary\n\n"
+ "| Product | Total | Active | Completed | Overdue |\n|---|---:|---:|---:|---:|\n"
+ products.map(p => "| " + p.name + " | " + p.total + " | " + p.active + " | " + p.done + " | " + p.overdue + " |").join("\n")
+ "\n\n## 3. Sprint Snapshot\n\n"
+ "| Sprint/List | Total | Active | Completed | Overdue |\n|---|---:|---:|---:|---:|\n"
+ (sprints.length ? sprints.map(p => "| " + p.name + " | " + p.total + " | " + p.active + " | " + p.done + " | " + p.overdue + " |").join("\n") : "| No sprint lists detected | 0 | 0 | 0 | 0 |")
+ "\n\n## 4. Team Workload\n\n" + (team.length ? team.join("\n") : "- No active assignees found.")
+ "\n\n## 5. Risks & Bottlenecks\n\n" + (risks.length ? risks.join("\n") : "- No automatic overdue/stale risk signals.")
+ "\n\n## 6. PM Actions\n\n" + actions.map((x,i) => (i+1) + ". " + x).join("\n")
+ "\n\n## Methodology\n\n"
+ "- Report is generated from the latest data.json synchronized from ClickUp.\n"
+ "- KPI counts use Primary/Parent Tasks only; subtasks are not counted separately.\n"
+ "- \"Bottleneck\" is not asserted from task count alone; queue signals require PM review.\n";

await fs.writeFile("report.md", report, "utf8");
console.log("Generated report.md");
