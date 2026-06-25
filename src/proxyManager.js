// Gerencia o ciclo de vida do processo xmrig-proxy e mantém um buffer de logs.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { shareTracker } from "./shareTracker.js";

const LOG_MAX_LINES = 1000;

class ProxyManager {
  constructor() {
    this.proc = null;
    this.logs = [];
    this.startedAt = null;
  }

  get running() {
    return this.proc !== null && this.proc.exitCode === null;
  }

  pushLog(line) {
    const text = `[${new Date().toISOString()}] ${line}`;
    this.logs.push(text);
    if (this.logs.length > LOG_MAX_LINES) {
      this.logs.splice(0, this.logs.length - LOG_MAX_LINES);
    }
    // Alimenta o rastreador de shares/blocos com cada linha do proxy.
    shareTracker.ingestLogLine(line);
  }

  start() {
    if (this.running) {
      throw new Error("xmrig-proxy já está rodando");
    }
    if (!fs.existsSync(config.proxyConfigPath)) {
      throw new Error(`config.json não encontrado em ${config.proxyConfigPath}`);
    }
    if (!fs.existsSync(config.proxyBin)) {
      throw new Error(`binário do xmrig-proxy não encontrado em ${config.proxyBin}`);
    }

    this.pushLog(`Iniciando ${config.proxyBin} --config=${config.proxyConfigPath}`);
    this.proc = spawn(config.proxyBin, [`--config=${config.proxyConfigPath}`], {
      cwd: path.dirname(config.proxyConfigPath),
    });
    this.startedAt = Date.now();

    this.proc.stdout.on("data", (d) => this.bufferOutput(d));
    this.proc.stderr.on("data", (d) => this.bufferOutput(d));
    this.proc.on("exit", (code, signal) => {
      this.pushLog(`xmrig-proxy encerrou (code=${code} signal=${signal})`);
      this.startedAt = null;
    });
    this.proc.on("error", (err) => {
      this.pushLog(`Erro ao iniciar: ${err.message}`);
    });
  }

  bufferOutput(buf) {
    const lines = buf.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) this.pushLog(line);
  }

  stop() {
    if (!this.running) {
      throw new Error("xmrig-proxy não está rodando");
    }
    this.pushLog("Parando xmrig-proxy (SIGTERM)…");
    this.proc.kill("SIGTERM");
  }

  async restart() {
    if (this.running) {
      this.stop();
      // Aguarda o processo realmente sair antes de subir de novo.
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!this.running) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 5000);
      });
    }
    this.start();
  }

  status() {
    return {
      running: this.running,
      pid: this.proc?.pid ?? null,
      uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
    };
  }
}

export const proxyManager = new ProxyManager();
