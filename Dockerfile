# ---- xmrig-proxy GUI + binário oficial do xmrig-proxy ----
FROM node:20-slim

# Versão do xmrig-proxy a baixar (release oficial do GitHub).
ARG XMRIG_PROXY_VERSION=6.22.0

# Dependências de runtime do xmrig-proxy + utilitários de download.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates libuv1 libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Baixa e instala o binário oficial do xmrig-proxy (linux x64, gcc).
RUN set -eux; \
    url="https://github.com/xmrig/xmrig-proxy/releases/download/v${XMRIG_PROXY_VERSION}/xmrig-proxy-${XMRIG_PROXY_VERSION}-linux-x64.tar.gz"; \
    curl -fSL "$url" -o /tmp/xmrig-proxy.tar.gz; \
    tar -xzf /tmp/xmrig-proxy.tar.gz -C /tmp; \
    cp /tmp/xmrig-proxy-${XMRIG_PROXY_VERSION}/xmrig-proxy /usr/local/bin/xmrig-proxy; \
    chmod +x /usr/local/bin/xmrig-proxy; \
    rm -rf /tmp/xmrig-proxy*

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
