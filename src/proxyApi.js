// Cliente para a API HTTP do xmrig-proxy. Usa fetch nativo (Node 18+).
import { config } from "./config.js";

const base = () => `http://${config.proxyApiHost}:${config.proxyApiPort}`;

async function apiGet(path) {
  const res = await fetch(base() + path, {
    headers: { Authorization: `Bearer ${config.proxyApiToken}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) {
    throw new Error(`API do proxy retornou ${res.status} em ${path}`);
  }
  return res.json();
}

// /1/summary traz hashrate, results (aceitos/rejeitados), uplink e contagem de miners.
export async function getSummary() {
  return apiGet("/1/summary");
}

// /1/workers traz a lista de mineradores conectados com hashrate por worker.
export async function getWorkers() {
  return apiGet("/1/workers");
}

// Resumo "achatado" e amigável para o dashboard.
export async function getDashboard() {
  const summary = await getSummary();

  const results = summary.results || {};
  const hashrate = summary.hashrate?.total || [];
  const miners = summary.miners || {};

  return {
    version: summary.version,
    uptime: summary.uptime,
    // hashrate.total = [10s, 60s, 15m]
    hashrate: {
      h10s: hashrate[0] ?? 0,
      h60s: hashrate[1] ?? 0,
      h15m: hashrate[2] ?? 0,
    },
    shares: {
      accepted: results.accepted ?? 0,
      rejected: results.rejected ?? 0,
      // "hashes" é o total de hashes reportados (shares válidos somados).
      totalHashes: results.hashes ?? 0,
      // Latência média dos shares ao pool.
      avgTime: results.avg_time ?? 0,
    },
    miners: {
      now: miners.now ?? summary.miners_count ?? 0,
      max: miners.max ?? 0,
    },
    // Conexão com o pool (uplink). aqui é onde aparece se está conectado.
    upstream: {
      accepted: summary.upstreams?.accepted ?? null,
      total: summary.upstreams?.total ?? null,
      error: summary.upstreams?.error ?? null,
    },
    pool: summary.pool || null,
  };
}
