// Cliente da API do pool (herominers e compatíveis com node-cryptonote-pool).
// Fornece dados REAIS que o proxy não tem: dificuldade da rede, best share,
// dificuldade por worker e blocos encontrados.
import { config } from "./config.js";

// Base da API do pool e carteira a consultar (configuráveis por env / GUI).
let poolApiBase = process.env.POOL_API_BASE || "https://zephyr.herominers.com/api";
let walletAddress = "";

// Extrai SOMENTE o endereço puro da carteira, removendo prefixos/sufixos de
// configuração que o minerador usa mas que a API do pool não aceita:
//   - prefixo de modo:   "solo:ENDERECO"
//   - dificuldade fixa:  "ENDERECO=96000"
//   - nome do worker:    "ENDERECO.NomeWorker"
//   - integrated/payid:  "ENDERECO+PAYMENTID"  (também removido para o stats_address)
export function sanitizeWalletAddress(raw) {
  if (!raw) return "";
  let addr = String(raw).trim();
  // Remove prefixo "modo:" (solo:, etc.)
  const colon = addr.indexOf(":");
  if (colon !== -1) addr = addr.slice(colon + 1);
  // Corta no primeiro separador de config: '=', '.', '+'
  addr = addr.split("=")[0].split(".")[0].split("+")[0];
  return addr.trim();
}

export function setPoolApi({ base, wallet }) {
  if (base) poolApiBase = base.replace(/\/+$/, "");
  if (wallet != null) walletAddress = sanitizeWalletAddress(wallet);
}

// Inicializa a carteira a partir do env (já sanitizada), se houver.
if (process.env.POOL_WALLET) walletAddress = sanitizeWalletAddress(process.env.POOL_WALLET);

export function getPoolApiConfig() {
  return { base: poolApiBase, wallet: walletAddress };
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Pool API ${res.status} em ${url}`);
  return res.json();
}

// /api/stats → dados gerais do pool e da rede.
export async function getPoolStats() {
  return fetchJson(`${poolApiBase}/stats`);
}

// /api/stats_address?address=... → stats da carteira (workers, blocos, shares).
export async function getAddressStats() {
  if (!walletAddress) throw new Error("Carteira do pool não configurada");
  return fetchJson(
    `${poolApiBase}/stats_address?address=${encodeURIComponent(walletAddress)}`,
  );
}

// Resumo unificado e amigável para a GUI.
export async function getPoolReport() {
  const [stats, addr] = await Promise.all([getPoolStats(), getAddressStats()]);

  const networkDiff = Number(stats?.network?.difficulty || 0);
  const networkHeight = Number(stats?.network?.height || 0);
  const coinSymbol = stats?.config?.symbol || stats?.config?.coin || "";

  const workers = Array.isArray(addr?.workers) ? addr.workers : [];

  // "Best share" prático: maior dificuldade de job atual entre os workers.
  let best = null;
  for (const w of workers) {
    const d = Number(w.lastJobDifficulty || 0);
    if (d > 0 && (!best || d > best.diff)) {
      best = { diff: d, miner: w.name || "?", at: w.lastShare ? w.lastShare * 1000 : null };
    }
  }

  const s = addr?.stats || {};
  const blocksFound = Number(s.blocksFoundSolo || 0) + Number(s.blocksFoundPool || 0);

  // Histórico de blocos confirmados/desbloqueados desta carteira.
  const unlocked = Array.isArray(addr?.unlocked) ? addr.unlocked : [];

  return {
    networkDiff,
    networkHeight,
    coinSymbol,
    best,
    bestPctOfNetwork: best && networkDiff > 0 ? (best.diff / networkDiff) * 100 : null,
    workers: workers.map((w) => ({
      name: w.name,
      hashrate: Number(w.hashrate || 0),
      lastJobDifficulty: Number(w.lastJobDifficulty || 0),
      blocksFound: Number(w.blocksFound || 0),
      lastShare: w.lastShare ? w.lastShare * 1000 : null,
      sharesGood: Number(w.shares_good || 0),
    })),
    blocksFound,
    blocksFoundSolo: Number(s.blocksFoundSolo || 0),
    blocksFoundPool: Number(s.blocksFoundPool || 0),
    unlocked,
    poolHashrate: Number(stats?.pool?.hashrate || stats?.pool?.stats?.hashrate || 0),
    walletHashrate: Number(s.hashrate || 0),
  };
}
