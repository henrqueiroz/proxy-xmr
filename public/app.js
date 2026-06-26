const $ = (id) => document.getElementById(id);

function fmtHashrate(h) {
  if (h == null) return "—";
  if (h >= 1e6) return (h / 1e6).toFixed(2) + " MH/s";
  if (h >= 1e3) return (h / 1e3).toFixed(2) + " kH/s";
  return h.toFixed(1) + " H/s";
}

// Formata uma dificuldade grande como 1.23G, 4.5M, etc.
function fmtDiff(d) {
  if (d == null || d === 0) return "—";
  if (d >= 1e12) return (d / 1e12).toFixed(2) + " T";
  if (d >= 1e9) return (d / 1e9).toFixed(2) + " G";
  if (d >= 1e6) return (d / 1e6).toFixed(2) + " M";
  if (d >= 1e3) return (d / 1e3).toFixed(2) + " k";
  return String(Math.round(d));
}

function fmtPct(p) {
  if (p == null) return "—";
  if (p >= 100) return p.toFixed(1) + "% 🎯";
  if (p >= 1) return p.toFixed(2) + "%";
  return p.toFixed(4) + "%";
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
  const hr = (w) => Number(w[8] ?? w[7] ?? 0);

  // Ordena do maior hashrate para o menor (ranking).
  const rows = [...r.data.workers].sort((a, b) => hr(b) - hr(a));

  // Média de hashrate (só de quem está produzindo) para destacar rigs abaixo.
  const active = rows.map(hr).filter((v) => v > 0);
  const avg = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;

  rows.forEach((w, i) => {
    const h = hr(w);
    // Marca em vermelho rigs com menos de 70% da média (provável má config/huge pages off).
    const slow = avg > 0 && h > 0 && h < avg * 0.7;
    const tr = document.createElement("tr");
    if (slow) tr.className = "slow-rig";
    const medal = i === 0 && h > 0 ? "🥇 " : "";
    tr.innerHTML = `<td>${medal}${w[0] ?? "—"}</td><td>${w[1] ?? "—"}</td>` +
      `<td>${fmtHashrate(h)}${slow ? " ⚠️" : ""}</td><td>${w[3] ?? 0}</td><td>${w[4] ?? 0}</td>`;
    tbody.appendChild(tr);
  });
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
  // Mostra a carteira "limpa": se o user terminar em ".rig_id", separa o nome de volta
  // para o campo Rig ID, evitando duplicar o sufixo ao salvar novamente.
  let wallet = pool.user || "";
  const rigId = pool.rig_id || "";
  if (rigId && wallet.endsWith("." + rigId)) {
    wallet = wallet.slice(0, -(rigId.length + 1));
  }
  card.querySelector(".p-url").value = pool.url || "";
  card.querySelector(".p-user").value = wallet;
  card.querySelector(".p-pass").value = pool.pass != null ? pool.pass : "x";
  card.querySelector(".p-rigid").value = rigId;
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
    const wallet = card.querySelector(".p-user").value.trim();
    const rigId = card.querySelector(".p-rigid").value.trim();
    // A maioria dos pools (herominers etc.) lê o nome do worker como "carteira.NOME".
    // Então, se o Rig ID estiver preenchido e ainda não fizer parte da carteira,
    // a GUI junta automaticamente para o nome aparecer no painel do pool.
    let user = wallet;
    if (rigId && !wallet.endsWith("." + rigId)) {
      user = wallet + "." + rigId;
    }
    pools.push({
      url,
      user,
      pass: card.querySelector(".p-pass").value || "x",
      rig_id: rigId || "proxy",
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

// ---- Best shares / blocos (via API do pool) ----
let poolCfgEdited = false;
$("f-poolwallet").addEventListener("input", () => { poolCfgEdited = true; });
$("f-poolbase").addEventListener("input", () => { poolCfgEdited = true; });

async function loadPoolCfg() {
  const r = await api("/api/pool-config");
  if (r.ok && !poolCfgEdited) {
    $("f-poolbase").value = r.base || "";
    $("f-poolwallet").value = r.wallet || "";
  }
}

async function savePoolCfg() {
  const r = await api("/api/pool-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base: $("f-poolbase").value.trim(),
      wallet: $("f-poolwallet").value.trim(),
    }),
  });
  if (r.ok) {
    poolCfgEdited = false;
    $("f-poolwallet").value = r.wallet || ""; // mostra já sanitizada
    refreshPool();
  }
}
$("btn-save-poolcfg").onclick = savePoolCfg;

// Parseia uma entrada de bloco do node-cryptonote-pool (string com ':').
function parseBlock(entry) {
  if (typeof entry !== "string") return entry;
  // Formato comum: hash:time:reward:height:difficulty:shares:...
  const p = entry.split(":");
  return {
    hash: p[0],
    time: p[1] ? Number(p[1]) * 1000 : null,
    height: p[3] || p[2] || "?",
    difficulty: p[4] ? Number(p[4]) : null,
  };
}

async function refreshPool() {
  const r = await api("/api/pool");
  const err = $("pool-error");
  if (!r.ok) {
    err.textContent = "Pool API: " + r.error + " (configure a carteira/URL acima)";
    return;
  }
  err.textContent = "";
  const d = r.data;

  $("best-diff").textContent = d.best ? fmtDiff(d.best.diff) : "—";
  $("best-miner").textContent = d.best ? d.best.miner : "—";
  $("best-pct").textContent = fmtPct(d.bestPctOfNetwork);
  $("net-diff").textContent = fmtDiff(d.networkDiff);
  $("net-height").textContent = d.networkHeight ? d.networkHeight.toLocaleString("pt-BR") : "—";
  $("blocks-found").textContent = d.blocksFound != null ? d.blocksFound : "—";

  // Dificuldade por minerador
  const stb = document.querySelector("#shares-table tbody");
  stb.innerHTML = "";
  for (const w of d.workers || []) {
    const pct = d.networkDiff > 0 ? (w.lastJobDifficulty / d.networkDiff) * 100 : null;
    const last = w.lastShare ? new Date(w.lastShare).toLocaleTimeString("pt-BR") : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${w.name || "—"}</td><td>${fmtHashrate(w.hashrate)}</td>` +
      `<td>${fmtDiff(w.lastJobDifficulty)}</td><td>${fmtPct(pct)}</td>` +
      `<td>${w.sharesGood}</td><td>${last}</td>`;
    stb.appendChild(tr);
  }

  // Blocos reais
  const btb = document.querySelector("#blocks-table tbody");
  btb.innerHTML = "";
  const blocks = (d.unlocked || []).map(parseBlock);
  if (blocks.length === 0) {
    btb.innerHTML = `<tr><td colspan="4" class="hint">Nenhum bloco encontrado ainda por esta carteira.</td></tr>`;
  } else {
    for (const b of blocks) {
      const when = b.time ? new Date(b.time).toLocaleString("pt-BR") : "—";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${b.height}</td><td>${fmtDiff(b.difficulty)}</td>` +
        `<td>confirmado</td><td>${when}</td>`;
      btb.appendChild(tr);
    }
  }
}

// Formata "quantas vezes falta" para o bloco (ex.: 628× ou —).
function fmtFactor(f) {
  if (f == null) return "—";
  if (f <= 1) return "🎯 BLOCO!";
  if (f >= 1000) return Math.round(f).toLocaleString("pt-BR") + "×";
  return f.toFixed(1) + "×";
}

async function refreshTop() {
  const r = await api("/api/topshares");
  if (!r.ok) return;
  const d = r.data;
  $("stream-status").textContent = d.connected ? "🟢 ao vivo" : "🔴 desconectado";

  const tb = document.querySelector("#top-table tbody");
  tb.innerHTML = "";
  if (!d.top || d.top.length === 0) {
    tb.innerHTML = `<tr><td colspan="6" class="hint">Aguardando shares do stream do pool…</td></tr>`;
    return;
  }
  d.top.forEach((s, i) => {
    const when = s.at ? new Date(s.at).toLocaleTimeString("pt-BR") : "—";
    const tr = document.createElement("tr");
    if (i === 0) tr.className = "top-best";
    tr.innerHTML = `<td>${i + 1}</td><td>${fmtDiff(s.value)}</td>` +
      `<td>${fmtPct(s.pct)}</td><td>${fmtFactor(s.factorToBlock)}</td>` +
      `<td>${s.miner}</td><td>${when}</td>`;
    tb.appendChild(tr);
  });
}

// Loop de atualização
let poolTickCount = 0;
function tick() {
  refreshStatus();
  refreshStats();
  refreshWorkers();
  refreshLogs();
  refreshTop(); // top shares é local (rápido), atualiza sempre
  // A API do pool é mais lenta e tem rate limit: atualiza a cada ~15s.
  if (poolTickCount % 5 === 0) refreshPool();
  poolTickCount++;
}
loadConfig();
loadPoolCfg();
tick();
setInterval(tick, 3000);
