#!/usr/bin/env bash
# Baixa e instala o binário oficial do xmrig-proxy de forma resiliente:
#  - se XMRIG_PROXY_VERSION=latest (ou vazio), descobre a última release via API do GitHub;
#  - tenta vários nomes de asset que o projeto usa (o esquema mudou entre versões);
#  - localiza o binário extraído sem depender do nome exato da pasta.
set -eu

VERSION="${1:-latest}"

if [ "$VERSION" = "latest" ] || [ -z "$VERSION" ]; then
  echo "Descobrindo a última versão do xmrig-proxy..."
  # Baixa o JSON da última release para arquivo (evita SIGPIPE com pipe + grep -m1).
  curl -fsSL https://api.github.com/repos/xmrig/xmrig-proxy/releases/latest -o /tmp/release.json
  TAG=$(grep '"tag_name"' /tmp/release.json | head -n1 | sed -E 's/.*"v?([^"]+)".*/\1/')
  rm -f /tmp/release.json
else
  TAG="$VERSION"
fi

if [ -z "$TAG" ]; then
  echo "ERRO: não consegui determinar a versão do xmrig-proxy" >&2
  exit 1
fi
echo "Usando xmrig-proxy versão: $TAG"

BASE="https://github.com/xmrig/xmrig-proxy/releases/download/v${TAG}"

# Candidatos de nome de asset, em ordem de preferência.
CANDIDATES="xmrig-proxy-${TAG}-linux-x64.tar.gz \
xmrig-proxy-${TAG}-linux-static-x64.tar.gz \
xmrig-proxy-${TAG}-lin64.tar.gz \
xmrig-proxy-${TAG}-linux-x86_64.tar.gz"

DL=""
for name in $CANDIDATES; do
  echo "Tentando: ${BASE}/${name}"
  if curl -fSL "${BASE}/${name}" -o /tmp/xmrig-proxy.tar.gz; then
    DL="$name"
    break
  fi
done

if [ -z "$DL" ]; then
  echo "ERRO: nenhum asset encontrado para a versão ${TAG}." >&2
  echo "Verifique os releases em https://github.com/xmrig/xmrig-proxy/releases" >&2
  exit 1
fi

echo "Baixado: $DL — extraindo..."
mkdir -p /tmp/xmrig-proxy-extract
tar -xzf /tmp/xmrig-proxy.tar.gz -C /tmp/xmrig-proxy-extract

# Acha o executável 'xmrig-proxy' onde quer que ele tenha sido extraído.
BIN=$(find /tmp/xmrig-proxy-extract -type f -name 'xmrig-proxy' | head -n1)
if [ -z "$BIN" ]; then
  echo "ERRO: binário xmrig-proxy não encontrado no pacote extraído" >&2
  exit 1
fi

cp "$BIN" /usr/local/bin/xmrig-proxy
chmod +x /usr/local/bin/xmrig-proxy
rm -rf /tmp/xmrig-proxy.tar.gz /tmp/xmrig-proxy-extract
echo "Instalado em /usr/local/bin/xmrig-proxy"
/usr/local/bin/xmrig-proxy --version || true
