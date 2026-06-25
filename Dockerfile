# ---- xmrig-proxy GUI + binário oficial do xmrig-proxy ----
FROM node:20-slim

# Versão do xmrig-proxy a baixar. "latest" descobre a última release automaticamente.
ARG XMRIG_PROXY_VERSION=latest

# Dependências de runtime do xmrig-proxy + utilitários de download.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates bash tar libuv1 libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Baixa e instala o binário oficial do xmrig-proxy de forma resiliente.
COPY scripts/install-xmrig-proxy.sh /tmp/install-xmrig-proxy.sh
RUN chmod +x /tmp/install-xmrig-proxy.sh \
    && /tmp/install-xmrig-proxy.sh "${XMRIG_PROXY_VERSION}" \
    && rm -f /tmp/install-xmrig-proxy.sh

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public

# Volume para persistir o config.json entre deploys.
ENV DATA_DIR=/data
RUN mkdir -p /data

# Portas:
#   8080 -> GUI web
#   8081 -> API HTTP do xmrig-proxy
#   3333 -> porta de mineração (miners conectam aqui) — ajuste no config "bind"
EXPOSE 8080 8081 3333

CMD ["node", "src/server.js"]
