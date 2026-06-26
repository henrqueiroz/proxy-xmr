import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { proxyManager } from "./proxyManager.js";
import { readConfig, writeConfig, ensureConfigExists } from "./proxyConfig.js";
import { getDashboard, getWorkers } from "./proxyApi.js";
import { getPoolReport, getPoolApiConfig, setPoolApi } from "./poolApi.js";
import { shareStream } from "./shareStream.js";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

// ---- Basic Auth simples para proteger a GUI ----
app.use((req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, pass] = Buffer.from(encoded, "base64").toString().split(":");
    if (user === config.guiUser && pass === config.guiPass) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="xmrig-proxy-gui"');
  res.status(401).send("Autenticação necessária");
});

// ---- API da GUI ----

app.get("/api/status", (req, res) => {
  res.json(proxyManager.status());
});

app.get("/api/stats", async (req, res) => {
  try {
    const data = await getDashboard();
    res.json({ ok: true, data });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get("/api/workers", async (req, res) => {
  try {
    const data = await getWorkers();
    res.json({ ok: true, data });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

app.get("/api/logs", (req, res) => {
  res.json({ logs: proxyManager.logs });
});

// Relatório real via API do pool (herominers): dificuldade da rede, best share,
// dificuldade por worker e blocos encontrados.
app.get("/api/pool", async (req, res) => {
  try {
    const data = await getPoolReport();
    // Mantém a dificuldade da rede no stream de shares atualizada.
    if (data.networkDiff) shareStream.setNetworkDiff(data.networkDiff);
    res.json({ ok: true, data });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Top 10 maiores shares (valor atingido) + % do bloco, via WebSocket do pool.
app.get("/api/topshares", (req, res) => {
  res.json({ ok: true, data: shareStream.snapshot() });
});

// Lê/define a URL da API do pool e a carteira a consultar (persistido em /data).
app.get("/api/pool-config", (req, res) => {
  res.json({ ok: true, ...getPoolApiConfig() });
});

app.post("/api/pool-config", (req, res) => {
  setPoolApi({ base: req.body.base, wallet: req.body.wallet });
  savePoolConfig(getPoolApiConfig());
  // (Re)conecta o WebSocket de shares para o host do novo pool.
  shareStream.connectFromApiBase(getPoolApiConfig().base);
  res.json({ ok: true, ...getPoolApiConfig() });
});

app.get("/api/config", (req, res) => {
  try {
    res.json({ ok: true, config: readConfig() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Salvar config. Por padrão reinicia o proxy para aplicar (todas as máquinas
// apontadas ao proxy passam a minerar com o novo pool/config).
app.post("/api/config", async (req, res) => {
  try {
    const saved = writeConfig(req.body.config);
    let restarted = false;
    if (req.body.restart !== false && proxyManager.running) {
      await proxyManager.restart();
      restarted = true;
    }
    res.json({ ok: true, config: saved, restarted });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/start", (req, res) => {
  try {
    proxyManager.start();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/stop", (req, res) => {
  try {
    proxyManager.stop();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/restart", async (req, res) => {
  try {
    await proxyManager.restart();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ---- Estáticos (UI) ----
app.use(express.static(path.join(__dirname, "..", "public"), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader("Cache-Control", "no-store"),
}));

// ---- Persistência da config do pool (URL da API + carteira) em /data ----
const POOL_CFG_FILE = path.join(config.dataDir, "pool-api.json");
function savePoolConfig(cfg) {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(POOL_CFG_FILE, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error("[gui] falha ao salvar pool-api.json:", err.message);
  }
}
function loadPoolConfig() {
  try {
    if (fs.existsSync(POOL_CFG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(POOL_CFG_FILE, "utf8"));
      setPoolApi(cfg);
    }
  } catch {}
}

// ---- Boot ----
ensureConfigExists();
loadPoolConfig();
// Conecta o WebSocket de shares ao vivo do host configurado (qualquer herominers).
shareStream.connectFromApiBase(getPoolApiConfig().base);
app.listen(config.guiPort, "0.0.0.0", () => {
  console.log(`[gui] xmrig-proxy-gui ouvindo em http://0.0.0.0:${config.guiPort}`);
  // Auto-start opcional do proxy ao subir o container.
  if (process.env.AUTO_START === "true") {
    try {
      proxyManager.start();
      console.log("[gui] xmrig-proxy iniciado automaticamente (AUTO_START=true)");
    } catch (err) {
      console.error("[gui] auto-start falhou:", err.message);
    }
  }
});
