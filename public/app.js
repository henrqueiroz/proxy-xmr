const $ = (id) => document.getElementById(id);

function fmtHashrate(h) {
  if (h == null) return "—";
  if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
  if (h >= 1e3) return (h / 1e3).toFixed(2) + " kH/s";
  return h.toFixed(1) + " H/s";
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  return res.json();
}

async function refreshStatus() {
  try {
    const s = await api("/api/status");
    const badge = $("proc-status");
    if (s.running) {
      badge.textContent = `Rodando · PID ${s.pid} · ${s.uptimeSeconds}s`;
      badge.className = "badge running";
    } else {
      badge.textContent = "Parado";
      badge.className = "badge stopped";
    }
  } catch {}
}

async function refreshStats() {
  const r = await api("/api/stats");
  const err = $("stats-error");
  if (!r.ok) {
    err.textContent = "Sem stats: " + r.error + " (o proxy está rodando com a API HTTP habilitada?)";
    return;
  }
  err.textContent = "";
  const d = r.data;
  $("hr-10s").textContent = fmtHashrate(d.hashrate.h10s);
  $("hr-60s").textContent = fmtHashrate(d.hashrate.h60s);
  $("hr-15m").textContent = fmtHashrate(d.hashrate.h15m);
  $("miners").textContent = `${d.miners.now} (máx ${d.miners.max})`;
  $("accepted").textContent = d.shares.accepted;
  $("rejected").textContent = d.shares.rejected;
  $("hashes").textContent = d.shares.totalHashes.toLocaleString("pt-BR");
  $("avgtime").textContent = d.shares.avgTime + " ms";
}

async function refreshWorkers() {
  const r = await api("/api/workers");
  const tbody = document.querySelector("#workers-table tbody");
  tbody.innerHTML = "";
  if (!r.ok || !r.data || !Array.isArray(r.data.workers)) return;
  // Formato da API: workers = [[id, ip, conn, accepted, rejected, invalid, hashes, hr0, hr1, ...], ...]
  for (const w of r.data.workers) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${w[0] ?? "—"}</td><td>${w[1] ?? "—"}</td>` +
      `<td>${fmtHashrate(w[8] ?? w[7] ?? 0)}</td><td>${w[3] ?? 0}</td><td>${w[4] ?? 0}</td>`;
    tbody.appendChild(tr);
  }
}

async function refreshLogs() {
  const r = await api("/api/logs");
  const pre = $("logs");
  pre.textContent = (r.logs || []).join("\n");
  pre.scrollTop = pre.scrollHeight;
}

async function loadConfig() {
  const r = await api("/api/config");
  if (r.ok) $("config-text").value = JSON.stringify(r.config, null, 2);
  else $("config-msg").textContent = "Erro: " + r.error;
}

async function saveConfig() {
  const msg = $("config-msg");
  let parsed;
  try {
    parsed = JSON.parse($("config-text").value);
  } catch (e) {
    msg.className = "msg error";
    msg.textContent = "JSON inválido: " + e.message;
    return;
  }
  const r = await api("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: parsed, restart: $("restart-on-save").checked }),
  });
  msg.className = r.ok ? "msg ok" : "msg error";
  msg.textContent = r.ok
    ? (r.restarted ? "Salvo e proxy reiniciado ✓" : "Salvo ✓")
    : "Erro: " + r.error;
  if (r.ok) loadConfig();
}

async function action(path) {
  const r = await api(path, { method: "POST" });
  if (!r.ok) alert("Erro: " + r.error);
  refreshStatus();
}

$("btn-start").onclick = () => action("/api/start");
$("btn-stop").onclick = () => action("/api/stop");
$("btn-restart").onclick = () => action("/api/restart");
$("btn-load-config").onclick = loadConfig;
$("btn-save-config").onclick = saveConfig;

// Loop de atualização
function tick() {
  refreshStatus();
  refreshStats();
  refreshWorkers();
  refreshLogs();
}
loadConfig();
tick();
setInterval(tick, 3000);
