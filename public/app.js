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

// Guarda o config bruto carregado para preservar campos que o formulário não edita.
let currentConfig = {};

function addPoolRow(pool = {}) {
  const tpl = $("pool-template").content.cloneNode(true);
  const card = tpl.querySelector(".pool-card");
  card.querySelector(".p-url").value = pool.url || "";
  card.querySelector(".p-user").value = pool.user || "";
  card.querySelector(".p-pass").value = pool.pass != null ? pool.pass : "x";
  card.querySelector(".p-rigid").value = pool.rig_id || "";
  card.querySelector(".p-tls").checked = pool.tls !== false ? !!pool.tls : false;
  card.querySelector(".p-keepalive").checked = pool.keepalive !== false;
  card.querySelector(".p-remove").onclick = () => card.remove();
  $("pools-list").appendChild(card);
}

function fillForm(cfg) {
  currentConfig = cfg || {};
  $("f-bind").value = Array.isArray(cfg.bind) ? cfg.bind[0] : (cfg.bind || "0.0.0.0:3333");
  $("f-mode").value = cfg.mode || "nicehash";
  $("f-donate").value = cfg["donate-level"] != null ? cfg["donate-level"] : 1;

  $("pools-list").innerHTML = "";
  const pools = Array.isArray(cfg.pools) && cfg.pools.length ? cfg.pools : [{}];
  pools.forEach(addPoolRow);

  // Espelha no editor avançado (JSON).
  $("config-text").value = JSON.stringify(cfg, null, 2);
}

// Monta o objeto config a partir do formulário, preservando o resto do config atual.
function buildConfigFromForm() {
  const pools = [];
  for (const card of document.querySelectorAll("#pools-list .pool-card")) {
    const url = card.querySelector(".p-url").value.trim();
    if (!url) continue;
    pools.push({
      url,
      user: card.querySelector(".p-user").value.trim(),
      pass: card.querySelector(".p-pass").value || "x",
      rig_id: card.querySelector(".p-rigid").value.trim() || "proxy",
      keepalive: card.querySelector(".p-keepalive").checked,
      tls: card.querySelector(".p-tls").checked,
      enabled: true,
    });
  }
  // Parte do config atual + sobrescreve os campos do formulário.
  const cfg = { ...currentConfig };
  cfg.bind = [$("f-bind").value.trim() || "0.0.0.0:3333"];
  cfg.mode = $("f-mode").value;
  cfg["donate-level"] = parseInt($("f-donate").value || "1", 10);
  cfg.pools = pools;
  return cfg;
}

async function loadConfig() {
  const r = await api("/api/config");
  if (r.ok) fillForm(r.config);
  else $("config-msg").textContent = "Erro: " + r.error;
}

async function postConfig(cfg) {
  const msg = $("config-msg");
  if (!cfg.pools || cfg.pools.length === 0) {
    msg.className = "msg error";
    msg.textContent = "Adicione pelo menos um pool com URL.";
    return;
  }
  const r = await api("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: cfg, restart: $("restart-on-save").checked }),
  });
  msg.className = r.ok ? "msg ok" : "msg error";
  msg.textContent = r.ok
    ? (r.restarted ? "Salvo e proxy reiniciado ✓" : "Salvo ✓")
    : "Erro: " + r.error;
  if (r.ok) loadConfig();
}

function saveConfig() {
  postConfig(buildConfigFromForm());
}

function saveJson() {
  const msg = $("config-msg");
  let parsed;
  try {
    parsed = JSON.parse($("config-text").value);
  } catch (e) {
    msg.className = "msg error";
    msg.textContent = "JSON inválido: " + e.message;
    return;
  }
  postConfig(parsed);
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
$("btn-save-json").onclick = saveJson;
$("btn-add-pool").onclick = () => addPoolRow();

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
