import fs from "node:fs/promises";

const TOKEN = process.env.CLICKUP_API_TOKEN;
const TEAM = process.env.CLICKUP_TEAM_ID || "90182542159";
const SPACE = process.env.CLICKUP_SPACE_ID || "901810258386";
const API = "https://api.clickup.com/api/v2";

const demo = {
  generated_at: new Date().toISOString(),
  source: "demo",
  workspace_id: TEAM,
  spaces: [],
  lists: [],
  tasks: [],
  errors: ["CLICKUP_API_TOKEN is not configured. Add it as a GitHub Actions repository secret."]
};

async function api(path, params = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  const r = await fetch(url, { headers: { Authorization: TOKEN, accept: "application/json" } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { err: text }; }
  if (!r.ok) throw new Error(`${r.status} ${path}: ${body.err || body.ECODE || text}`);
  return body;
}

async function paged(path, key, params = {}) {
  const out = [];
  for (let page = 0; ; page++) {
    const b = await api(path, {...params, page});
    const rows = b[key] || [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

function flatFolders(folders) { return folders || []; }

async function main() {
  if (!TOKEN) {
    await fs.writeFile("data.json", JSON.stringify(demo, null, 2));
    console.log("No ClickUp token; published demo fallback.");
    return;
  }

  const errors = [];
  const spaces = await paged(`/team/${TEAM}/space`, "spaces", { archived:false });
  const targetSpace = spaces.find(s => String(s.id) === String(SPACE)) || spaces[0];
  const allLists = [];

  for (const space of spaces) {
    let folders = [];
    try { folders = await paged(`/space/${space.id}/folder`, "folders", { archived:false }); }
    catch (e) { errors.push(String(e)); }

    for (const folder of flatFolders(folders)) {
      try {
        const lists = await paged(`/folder/${folder.id}/list`, "lists", { archived:false });
        for (const l of lists) allLists.push({...l, space_id:space.id, space_name:space.name, folder_id:folder.id, folder_name:folder.name});
      } catch (e) { errors.push(String(e)); }
    }

    try {
      const lists = await paged(`/space/${space.id}/list`, "lists", { archived:false });
      for (const l of lists) allLists.push({...l, space_id:space.id, space_name:space.name, folder_id:null, folder_name:null});
    } catch (e) { errors.push(String(e)); }
  }

  const uniqueLists = [...new Map(allLists.map(l => [String(l.id), l])).values()];
  const tasks = [];

  for (const list of uniqueLists) {
    try {
      const rows = await paged(`/list/${list.id}/task`, "tasks", {
        archived:false, subtasks:false, include_closed:true, include_timl:false, order_by:"updated", reverse:true
      });
      for (const t of rows) {
        tasks.push({
          id:t.id, name:t.name, status:t.status?.status || "Unknown",
          status_type:t.status?.type || null,
          assignees:(t.assignees||[]).map(a => ({id:a.id, username:a.username, name:a.display_name || a.username})),
          priority:t.priority ? {id:t.priority.id, name:t.priority.priority} : null,
          due_date:t.due_date || null, start_date:t.start_date || null,
          date_created:t.date_created || null, date_updated:t.date_updated || null,
          date_done:t.date_done || null, parent:t.parent || null,
          url:t.url || null, points:t.points ?? null, time_estimate:t.time_estimate || null,
          list_id:list.id, list_name:list.name, space_id:list.space_id,
          space_name:list.space_name, folder_id:list.folder_id, folder_name:list.folder_name
        });
      }
    } catch (e) { errors.push(`List ${list.id} ${list.name}: ${e}`); }
  }

  const open = tasks.filter(t => !["closed","done"].includes(String(t.status_type).toLowerCase()));
  const now = Date.now();
  for (const t of open) {
    t.age_days = t.date_updated ? Math.max(0, (now - Number(t.date_updated))/86400000) : null;
    t.overdue = !!t.due_date && Number(t.due_date) < now && !t.date_done;
  }

  const data = {
    generated_at:new Date().toISOString(), source:"clickup", workspace_id:TEAM,
    space_id:targetSpace?.id || SPACE, space_name:targetSpace?.name || "Deepen",
    spaces:spaces.map(s=>({id:s.id,name:s.name})),
    lists:uniqueLists.map(l=>({id:l.id,name:l.name,space_id:l.space_id,space_name:l.space_name,folder_id:l.folder_id,folder_name:l.folder_name,start_date:l.start_date||null,due_date:l.due_date||null})),
    tasks, errors
  };
  await fs.writeFile("data.json", JSON.stringify(data, null, 2));
  console.log(`Synced ${uniqueLists.length} lists and ${tasks.length} primary tasks.`);
  if (errors.length) console.log(`${errors.length} non-fatal errors`);
}
main().catch(async e => {
  console.error(e);
  demo.errors = [String(e)];
  await fs.writeFile("data.json", JSON.stringify(demo, null, 2));
  process.exit(0);
});