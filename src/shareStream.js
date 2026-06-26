// Conecta no WebSocket de "live shares" do herominers (cryptonote-nodejs-pool)
// e mantém o TOP 10 dos maiores valores de share atingidos, com a % em relação
// à dificuldade da rede ("progresso até o bloco").
//
// IMPORTANTE: o endpoint do WS não é documentado. Este módulo é tolerante:
// tenta algumas URLs conhecidas, parseia mensagens que contenham o padrão
// "of TARGET / VALUE ... worker NOME" e ignora o resto. Se o herominers mudar
// o formato, ajusta-se o regex em parseShareMessage().
import { WebSocket } from "ws";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const TOP_N = 10;
const TOP_FILE = path.join(config.dataDir, "top-shares.json");

class ShareStream {
  constructor() {
    this.top = [];           // top 10 por valor atingido [{ value, target, miner, at }]
    this.lastShares = [];    // últimos shares (cronológico) para referência
    this.networkDiff = 0;
    this.connected = false;
    this.wsUrl = null;
    this.ws = null;
    this.host = null;
    this.loadTop();
  }

  loadTop() {
    try {
      if (fs.existsSync(TOP_FILE)) {
        const raw = JSON.parse(fs.readFileSync(TOP_FILE, "utf8"));
        if (Array.isArray(raw.top)) this.top = raw.top;
      }
    } catch {}
  }

  saveTop() {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(TOP_FILE, JSON.stringify({ top: this.top }, null, 2));
    } catch {}
  }

  setNetworkDiff(d) {
    const n = Number(d);
    if (!isNaN(n) && n > 0) this.networkDiff = n;
  }

  // Deriva a URL do WS a partir da base da API do pool (ex.:
  // https://zephyr.herominers.com/api -> wss://zephyr.herominers.com/).
  connectFromApiBase(apiBase) {
    try {
      const u = new URL(apiBase);
      const host = u.host;
      if (this.host === host && this.connected) return; // já conectado
      this.host = host;
      const wsUrl = `wss://${host}/`;
      this.connect(wsUrl);
    } catch (err) {
      // base inválida; ignora
    }
  }

  connect(wsUrl) {
    // Fecha conexão anterior, se houver.
    if (this.ws) {
      try { this.ws.removeAllListeners(); this.ws.terminate(); } catch {}
      this.ws = null;
    }
    this.wsUrl = wsUrl;
    let ws;
    try {
      ws = new WebSocket(wsUrl, { handshakeTimeout: 8000 });
    } catch (err) {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      this.connected = true;
      // O cryptonote-nodejs-pool costuma esperar uma mensagem inicial de "scope".
      try {
        ws.send(JSON.stringify({ type: "subscribe", channel: "shares" }));
      } catch {}
    });

    ws.on("message", (data) => this.handleMessage(data.toString()));

    ws.on("close", () => {
      this.connected = false;
      this.scheduleReconnect();
    });
    ws.on("error", () => {
      this.connected = false;
      // o close cuidará do reconnect
    });
  }

  scheduleReconnect() {
    clearTimeout(this._reconnTimer);
    this._reconnTimer = setTimeout(() => {
      if (this.wsUrl) this.connect(this.wsUrl);
    }, 15000);
  }

  handleMessage(text) {
    // As mensagens podem ser JSON ou texto. Tentamos extrair shares de ambos.
    const share = parseShareMessage(text);
    if (share) this.recordShare(share);
  }

  recordShare(share) {
    this.lastShares.unshift(share);
    if (this.lastShares.length > 50) this.lastShares.pop();

    // Mantém o top 10 por valor atingido.
    this.top.push(share);
    this.top.sort((a, b) => b.value - a.value);
    if (this.top.length > TOP_N) this.top.length = TOP_N;
    this.saveTop();
  }

  snapshot() {
    const pctOf = (v) => (this.networkDiff > 0 ? (v / this.networkDiff) * 100 : null);
    const factorOf = (v) =>
      this.networkDiff > 0 && v > 0 ? this.networkDiff / v : null; // "quantas vezes falta"
    return {
      connected: this.connected,
      networkDiff: this.networkDiff,
      top: this.top.map((s) => ({
        ...s,
        pct: pctOf(s.value),
        factorToBlock: factorOf(s.value),
      })),
      recent: this.lastShares.slice(0, 10).map((s) => ({
        ...s,
        pct: pctOf(s.value),
      })),
    };
  }
}

// Extrai { target, value, miner, at } de uma mensagem do stream.
// Casa o padrão usado no log do herominers:
//   "Good share <hash> of <TARGET> / <VALUE> from solo worker <NOME> (...)"
// e também tenta JSON com campos difficulty/shareDiff/worker.
export function parseShareMessage(text) {
  if (!text) return null;

  // 1) Formato de texto "of TARGET / VALUE ... worker NOME"
  const m = text.match(/of\s+([0-9]+)\s*\/\s*([0-9]+).*?worker\s+([^\s(]+)/i);
  if (m) {
    return {
      target: parseInt(m[1], 10),
      value: parseInt(m[2], 10),
      miner: m[3],
      at: new Date().toISOString(),
    };
  }

  // 2) Formato JSON (tolerante a nomes de campo)
  try {
    const obj = JSON.parse(text);
    const target = Number(obj.difficulty || obj.target || obj.jobDifficulty);
    const value = Number(obj.shareDiff || obj.hashDiff || obj.value || obj.actualDiff);
    const miner = obj.worker || obj.workerName || obj.login || "?";
    if (value > 0) {
      return { target: target || 0, value, miner, at: new Date().toISOString() };
    }
  } catch {}

  return null;
}

export const shareStream = new ShareStream();
