// Configuração da própria GUI (lida de variáveis de ambiente do EasyPanel).
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "/data";

export const config = {
  // Porta onde a GUI web escuta.
  guiPort: parseInt(process.env.GUI_PORT || "8080", 10),

  // Usuário/senha para acessar a GUI (Basic Auth). Defina no EasyPanel!
  guiUser: process.env.GUI_USER || "admin",
  guiPass: process.env.GUI_PASS || "admin",

  // Caminho do binário do xmrig-proxy dentro do container.
  proxyBin: process.env.PROXY_BIN || "/usr/local/bin/xmrig-proxy",

  // config.json do xmrig-proxy (persistido em volume para sobreviver a redeploys).
  proxyConfigPath: process.env.PROXY_CONFIG || path.join(DATA_DIR, "config.json"),

  // Endereço da API HTTP do xmrig-proxy (precisa bater com o config.json -> http).
  proxyApiHost: process.env.PROXY_API_HOST || "127.0.0.1",
  proxyApiPort: parseInt(process.env.PROXY_API_PORT || "8081", 10),
  proxyApiToken: process.env.PROXY_API_TOKEN || "changeme-token",

  dataDir: DATA_DIR,
};
