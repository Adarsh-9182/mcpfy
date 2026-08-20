/**
 * The dev inspector, as one self-contained page.
 *
 * No bundler, no framework, no network fetches. Three reasons, all of which
 * matter more than the polish a build step would buy:
 *
 *   - It ships inside the SDK. A React app would mean a second build pipeline
 *     and megabytes in a package whose whole pitch is that it is small.
 *   - It has to work offline and on the first run, before anything is
 *     installed beyond the SDK itself.
 *   - It is the thing you open when your server is broken. It should have as
 *     few moving parts as possible.
 *
 * The palette is the product's own: near-black surfaces, one cyan accent that
 * only ever marks something interactive or live.
 */
export function inspectorHtml(): string {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCPfy Inspector</title>
<style>
  :root {
    --bg:#050505; --surface:#0b0b0d; --panel:#111114; --line:#222226;
    --fg:#e8eaee; --hi:#f4f6f8; --muted:#9aa1ad; --faint:#4a5260;
    --accent:#22d3ee; --accent-dim:#072b33; --danger:#f3556c; --ok:#2fd18a;
    --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
       font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  header{display:flex;align-items:center;gap:12px;padding:10px 16px;
         border-bottom:1px solid var(--line);background:var(--surface)}
  .logo{width:16px;height:16px;border-radius:4px;background:var(--accent);
        display:grid;place-items:center;flex:none}
  .logo i{width:6px;height:6px;border-radius:1px;background:#041a1f;display:block}
  .name{font-weight:600;color:var(--hi)}
  .url{font-family:var(--mono);font-size:12px;color:var(--accent)}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex:none}
  .dot.live{background:var(--ok);box-shadow:0 0 8px var(--ok)}
  .spacer{flex:1}
  button{font:inherit;border-radius:6px;border:1px solid var(--line);
         background:var(--panel);color:var(--fg);padding:5px 10px;cursor:pointer}
  button:hover{border-color:#2e2e34}
  button.primary{background:var(--accent);color:#041a1f;border-color:transparent;font-weight:500}
  button.primary:disabled{opacity:.45;cursor:default}
  main{display:grid;grid-template-columns:270px 1fr 1fr;height:calc(100vh - 45px)}
  @media(max-width:1000px){main{grid-template-columns:1fr;height:auto}}
  section{overflow:auto;border-right:1px solid var(--line);padding:14px}
  h2{font-size:10px;text-transform:uppercase;letter-spacing:.14em;
     color:var(--faint);margin:0 0 10px;font-weight:500}
  .item{padding:8px 10px;border:1px solid transparent;border-radius:7px;cursor:pointer}
  .item:hover{background:var(--panel)}
  .item.on{background:var(--accent-dim);border-color:#14505c}
  .item .n{font-family:var(--mono);font-size:12px;color:var(--hi)}
  .item.on .n{color:var(--accent)}
  .item .d{font-size:12px;color:var(--muted);margin-top:2px}
  label{display:block;font-size:12px;color:var(--muted);margin:10px 0 4px}
  label .req{color:var(--danger)}
  input,textarea{width:100%;background:var(--surface);border:1px solid var(--line);
    color:var(--fg);border-radius:6px;padding:7px 9px;font:13px var(--mono)}
  input:focus,textarea:focus{outline:none;border-color:var(--accent)}
  pre{background:var(--surface);border:1px solid var(--line);border-radius:7px;
      padding:10px;overflow:auto;font:12px/1.5 var(--mono);margin:8px 0 0;color:var(--fg)}
  .frame{border:1px solid var(--line);border-radius:7px;margin-bottom:6px;background:var(--surface)}
  .frame>summary{padding:7px 10px;cursor:pointer;display:flex;gap:8px;align-items:center;
                 font:12px var(--mono);list-style:none}
  .frame>summary::-webkit-details-marker{display:none}
  .arrow{color:var(--faint)}
  .frame.res .arrow{color:var(--accent)}
  .frame.err{border-color:#40202a}
  .frame.err .arrow{color:var(--danger)}
  .ms{margin-left:auto;color:var(--faint)}
  .empty{color:var(--faint);font-size:13px;padding:20px 0;text-align:center}
  .err-box{border:1px solid #40202a;background:#1e0f13;color:var(--danger);
           border-radius:7px;padding:10px;font-size:13px;margin-top:10px}
  .hint{font-size:12px;color:var(--faint);margin-top:8px;line-height:1.6}
</style>
</head>
<body>
<header>
  <span class="logo"><i></i></span>
  <span class="name">MCPfy Inspector</span>
  <span class="dot" id="dot"></span>
  <span class="url" id="ep">/mcp</span>
  <span class="spacer"></span>
  <button onclick="clearFrames()">Clear log</button>
  <button onclick="connect()">Reconnect</button>
</header>
<main>
  <section>
    <h2>Tools <span id="tn"></span></h2>
    <div id="tools"><div class="empty">Connecting…</div></div>
    <h2 style="margin-top:20px">Resources <span id="rn"></span></h2>
    <div id="resources"></div>
    <h2 style="margin-top:20px">Prompts <span id="pn"></span></h2>
    <div id="prompts"></div>
  </section>
  <section>
    <h2>Request</h2>
    <div id="form"><div class="empty">Select a tool.</div></div>
  </section>
  <section style="border-right:none">
    <h2>JSON-RPC <span id="fn"></span></h2>
    <div id="frames"><div class="empty">Nothing yet.</div></div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
let sessionId = null, tools = [], selected = null;

/** Streamable HTTP answers with JSON or SSE depending on the call, so both. */
async function readBody(response) {
  const type = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!type.includes("text/event-stream")) {
    try { return JSON.parse(text); } catch { return null; }
  }
  for (const line of text.split(/\\r?\\n/)) {
    if (!line.startsWith("data:")) continue;
    try { return JSON.parse(line.slice(5).trim()); } catch {}
  }
  return null;
}

async function rpc(method, params) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const response = await fetch("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params || {} }),
  });

  const sid = response.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  const body = await readBody(response);
  if (body && body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body && body.result;
}

async function notify(method) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  await fetch("/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method }) });
}

async function connect() {
  sessionId = null;
  $("dot").className = "dot";
  $("tools").innerHTML = '<div class="empty">Connecting…</div>';
  try {
    const info = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcpfy-inspector", version: "1.0.0" },
    });
    await notify("notifications/initialized");
    $("dot").className = "dot live";
    if (info && info.serverInfo) {
      $("ep").textContent = info.serverInfo.name + " · /mcp";
    }
    await Promise.all([loadTools(), loadList("resources"), loadList("prompts")]);
  } catch (err) {
    $("dot").className = "dot";
    $("tools").innerHTML = '<div class="err-box">' + escapeHtml(err.message) + "</div>";
  }
}

async function loadTools() {
  const result = await rpc("tools/list");
  tools = (result && result.tools) || [];
  $("tn").textContent = tools.length || "";
  $("tools").innerHTML = tools.length
    ? tools.map((t, i) =>
        '<div class="item" onclick="pick(' + i + ')" id="tool' + i + '">' +
        '<div class="n">' + escapeHtml(t.name) + "</div>" +
        (t.description ? '<div class="d">' + escapeHtml(t.description) + "</div>" : "") +
        "</div>").join("")
    : '<div class="empty">No tools.</div>';
}

async function loadList(kind) {
  try {
    const result = await rpc(kind + "/list");
    const items = (result && (result[kind] || [])) || [];
    $(kind === "resources" ? "rn" : "pn").textContent = items.length || "";
    $(kind).innerHTML = items.length
      ? items.map((item) =>
          '<div class="item"><div class="n">' +
          escapeHtml(item.name || item.uri) + "</div>" +
          (item.description ? '<div class="d">' + escapeHtml(item.description) + "</div>" : "") +
          "</div>").join("")
      : '<div class="empty" style="padding:8px 0">None.</div>';
  } catch {
    // A server may legitimately not implement resources or prompts at all;
    // that is not an error worth shouting about.
    $(kind).innerHTML = '<div class="empty" style="padding:8px 0">Not supported.</div>';
  }
}

function pick(index) {
  selected = tools[index];
  tools.forEach((_, i) => $("tool" + i).classList.toggle("on", i === index));

  const schema = selected.inputSchema || {};
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const names = Object.keys(props);

  $("form").innerHTML =
    "<div style='font:13px var(--mono);color:var(--accent)'>" + escapeHtml(selected.name) + "</div>" +
    (selected.description ? "<div class='d' style='color:var(--muted);font-size:12px;margin-top:4px'>" + escapeHtml(selected.description) + "</div>" : "") +
    (names.length
      ? names.map((name) => {
          const field = props[name] || {};
          const isReq = required.has(name);
          return "<label>" + escapeHtml(name) +
            (isReq ? ' <span class="req">*</span>' : "") +
            ' <span style="color:var(--faint)">' + escapeHtml(field.type || "any") + "</span>" +
            (field.description ? '<div style="color:var(--faint);font-weight:400">' + escapeHtml(field.description) + "</div>" : "") +
            "</label>" +
            '<input id="f_' + escapeAttr(name) + '" data-type="' + escapeAttr(field.type || "string") + '" placeholder="' + escapeAttr(field.type || "") + '">';
        }).join("")
      : "<div class='hint'>This tool takes no arguments.</div>") +
    '<div style="margin-top:14px"><button class="primary" onclick="callTool()">Run tool</button></div>' +
    '<div id="out"></div>';
}

async function callTool() {
  if (!selected) return;
  const schema = selected.inputSchema || {};
  const args = {};
  for (const name of Object.keys(schema.properties || {})) {
    const el = $("f_" + name);
    if (!el || el.value === "") continue;
    const type = el.dataset.type;
    if (type === "number" || type === "integer") args[name] = Number(el.value);
    else if (type === "boolean") args[name] = el.value === "true";
    else if (type === "object" || type === "array") {
      try { args[name] = JSON.parse(el.value); }
      catch { return showOut('<div class="err-box">' + escapeHtml(name) + " must be valid JSON.</div>"); }
    } else args[name] = el.value;
  }

  showOut('<div class="empty">Running…</div>');
  try {
    const result = await rpc("tools/call", { name: selected.name, arguments: args });
    showOut("<pre>" + escapeHtml(JSON.stringify(result, null, 2)) + "</pre>");
  } catch (err) {
    showOut('<div class="err-box">' + escapeHtml(err.message) + "</div>");
  }
}

function showOut(html) { $("out").innerHTML = html; }

/* ----------------------------------------------------- the frame log ---- */
let frameCount = 0;

function addFrame(frame) {
  const box = $("frames");
  if (frameCount === 0) box.innerHTML = "";
  frameCount++;
  $("fn").textContent = frameCount;

  const el = document.createElement("details");
  el.className = "frame " + (frame.isError ? "err" : frame.direction === "response" ? "res" : "req");
  el.innerHTML =
    "<summary><span class='arrow'>" + (frame.direction === "request" ? "→" : "←") + "</span>" +
    "<span>" + escapeHtml(frame.method || (frame.isError ? "error" : "result")) + "</span>" +
    (frame.durationMs !== null ? "<span class='ms'>" + frame.durationMs + "ms</span>" : "") +
    "</summary><pre>" + escapeHtml(JSON.stringify(frame.payload, null, 2)) + "</pre>";
  box.prepend(el);
}

function clearFrames() {
  fetch("/__frames/clear", { method: "POST" });
  frameCount = 0;
  $("fn").textContent = "";
  $("frames").innerHTML = '<div class="empty">Nothing yet.</div>';
}

new EventSource("/__events").onmessage = (event) => {
  try { addFrame(JSON.parse(event.data)); } catch {}
};

/* Text from the server is untrusted here in exactly the way it is anywhere
   else: a tool description is written by whoever wrote the server, and this
   page renders it. Everything interpolated goes through one of these. */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function escapeAttr(value) { return escapeHtml(value).replace(/\x60/g, "&#96;"); }

connect();
</script>
</body>
</html>`;
}
