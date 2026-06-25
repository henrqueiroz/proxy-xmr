// Rastreia "best shares" parseando os logs do xmrig-proxy.
//
// O xmrig-proxy, ao aceitar um share, loga uma linha contendo a dificuldade do
// share (campo "diff") e geralmente o IP do minerador. Este módulo extrai isso,
// mantém os últimos N shares, o maior share já visto e calcula a % em relação
// à dificuldade da rede (informada manualmente ou via API do pool).
//
// LIMITAÇÃO: a dificuldade individual do share e o IP dependem do formato de log
// da versão do xmrig-proxy. Funciona melhor com "verbose" ligado no config.

import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const MAX_SHARES = 10;        // últimos 10 best shares exibidos
const MAX_BLOCKS = 500;       // histórico de "blocos" (shares >= diff da rede)
const BLOCKS_FILE = path.join(config.dataDir, "blocks.json");

class ShareTracker {
  constructor() {
    this.shares = [];          // [{ diff, miner, at }]
    this.best = null;          // maior share visto { diff, miner, at }
    this.blocks = [];          // shares que atingiram/superaram a diff da rede
    this.networkDiff = 0;      // dificuldade da rede (manual ou via API)
    // mapa IP -> nome do worker, preenchido a partir da API /workers
    this.minerNames = {};
    this.loadBlocks();
  }

  loadBlocks() {
    try {
      if (fs.existsSync(BLOCKS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(BLOCKS_FILE, "utf8"));
        if (Array.isArray(raw.blocks)) this.blocks = raw.blocks;
        if (raw.networkDiff) this.networkDiff = raw.networkDiff;
      }
    } catch {}
  }

  saveBlocks() {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(
        BLOCKS_FILE,
        JSON.stringify({ blocks: this.blocks, networkDiff: this.networkDiff }, null, 2),
      );
    } catch {}
  }

  setNetworkDiff(d) {
    const n = Number(d);
    if (!isNaN(n) && n > 0) {
      this.networkDiff = n;
      this.saveBlocks();
    }
  }

  // Atualiza o mapa IP->nome a partir do /1/workers do proxy.
  updateMinerNames(workers) {
    if (!workers || !Array.isArray(workers.workers)) return;
    for (const w of workers.workers) {
      // formato: [id/name, ip, ...]
      if (w[1]) this.minerNames[w[1]] = w[0] || w[1];
    }
  }

  nameFor(ip) {
    if (!ip) return "?";
    return this.minerNames[ip] || ip;
  }

  // Recebe uma linha de log do proxy e tenta extrair um share aceito.
  ingestLogLine(line) {
    if (!line) return;
    // Só nos interessam linhas de share aceito.
    // Ex.: "accepted (7/0) diff 30013 ip 177.68.12.11 (72 ms)"
    if (!/accepted/i.test(line)) return;

    const diffMatch = line.match(/diff\s+([0-9]+(?:\.[0-9]+)?[kKmMgGtT]?)/);
    if (!diffMatch) return;
    const diff = parseDiff(diffMatch[1]);
    if (!diff) return;

    const ipMatch = line.match(/ip\s+([0-9a-fA-F:.]+)/);
    const ip = ipMatch ? ipMatch[1] : null;

    const entry = { diff, miner: this.nameFor(ip), ip, at: new Date().toISOString() };

    this.shares.unshift(entry);
    if (this.shares.length > MAX_SHARES) this.shares.pop();

    if (!this.best || diff > this.best.diff) this.best = entry;

    // Se o share atingiu/superou a dificuldade da rede, registra como "bloco".
    if (this.networkDiff > 0 && diff >= this.networkDiff) {
      this.blocks.unshift({ ...entry, networkDiff: this.networkDiff });
      if (this.blocks.length > MAX_BLOCKS) this.blocks.pop();
      this.saveBlocks();
    }
  }

  // Resumo para a API/GUI.
  snapshot() {
    const best = this.best;
    const pct = best && this.networkDiff > 0
      ? (best.diff / this.networkDiff) * 100
      : null;
    return {
      networkDiff: this.networkDiff,
      best,
      bestPctOfNetwork: pct,
      recentShares: this.shares,
      blocks: this.blocks,
    };
  }
}

// Converte "30k", "1.2M", "10G", "1T" ou número puro em valor numérico.
function parseDiff(s) {
  const m = String(s).match(/^([0-9]+(?:\.[0-9]+)?)([kKmMgGtT]?)$/);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { k: 1e3, m: 1e6, g: 1e9, t: 1e12 }[unit] || 1;
  return v * mult;
}

export const shareTracker = new ShareTracker();
export { parseDiff };
