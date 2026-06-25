// Leitura/escrita do config.json do xmrig-proxy + geração de um config padrão.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Config padrão mínimo e funcional para o xmrig-proxy.
// A seção "http" precisa estar habilitada para a GUI conseguir ler as stats.
export function defaultProxyConfig() {
  return {
    autosave: true,
    background: false,
    colors: false,
    mode: "nicehash",
    bind: ["0.0.0.0:3333"],
    pools: [
      {
        url: "pool.exemplo.com:443",
        user: "SUA_CARTEIRA",
        pass: "x",
        rig_id: "proxy",
        keepalive: true,
        tls: true,
        enabled: true,
      },
    ],
    "access-log-file": null,
    "log-file": null,
    "donate-level": 1,
    http: {
      enabled: true,
      host: "0.0.0.0",
      port: config.proxyApiPort,
      "access-token": config.proxyApiToken,
      restricted: false,
    },
    api: {
      id: null,
      worker_id: "easypanel-proxy",
    },
    "reuse-timeout": 0,
    "custom-diff": 0,
    verbose: 0,
    workers: true,
  };
}

export function ensureConfigExists() {
  const dir = path.dirname(config.proxyConfigPath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(config.proxyConfigPath)) {
    fs.writeFileSync(
      config.proxyConfigPath,
      JSON.stringify(defaultProxyConfig(), null, 2),
    );
  }
}

export function readConfig() {
  ensureConfigExists();
  const raw = fs.readFileSync(config.proxyConfigPath, "utf8");
  return JSON.parse(raw);
}

export function writeConfig(obj) {
  // Valida que é JSON serializável e garante http habilitado para a GUI funcionar.
  if (typeof obj !== "object" || obj === null) {
    throw new Error("Config inválido: precisa ser um objeto JSON");
  }
  obj.http = obj.http || {};
  obj.http.enabled = true;
  obj.http.port = obj.http.port || config.proxyApiPort;
  obj.http["access-token"] = obj.http["access-token"] || config.proxyApiToken;

  const dir = path.dirname(config.proxyConfigPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.proxyConfigPath, JSON.stringify(obj, null, 2));
  return obj;
}
