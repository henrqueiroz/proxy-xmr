# xmrig-proxy GUI

Web GUI em Node.js para gerenciar o [xmrig-proxy](https://github.com/xmrig/xmrig-proxy) e rodá-lo direto no **EasyPanel**.

Recursos:

- ✅ **Formulário visual de configuração** (pools, carteira, porta, TLS, modo) — a GUI **gera o config.json sozinha**; não precisa editar JSON. Há um "modo avançado" opcional para editar o JSON cru. Ao salvar, o proxy reinicia e **todas as máquinas apontadas para o proxy passam a minerar com a nova configuração**.
- ✅ **Iniciar / parar / reiniciar** o processo do xmrig-proxy.
- ✅ **Estatísticas ao vivo**: hashrate (10s/60s/15m), mineradores conectados, shares aceitos/rejeitados, latência.
- ✅ **Lista de mineradores** conectados com hashrate por worker.
- ✅ **Logs** do proxy em tempo real.

## ⚠️ Sobre "blocos quebrados" (blocks found)

O xmrig-proxy **não encontra blocos** e **não sabe quantos blocos foram quebrados**. Ele só agrega os mineradores e repassa os *shares* para o pool. Quem encontra blocos é o **pool de mineração**.

O que a GUI mostra do proxy: **shares aceitos/rejeitados** e total de hashes — que é o equivalente, do lado do proxy, ao "trabalho válido" enviado. Para ver blocos de fato, você consulta o **dashboard do seu pool** com a sua carteira. Se o seu pool tiver uma API pública, dá para integrar depois (criar um endpoint que consome a API do pool e mostra blocos no dashboard) — me avise o pool e eu adiciono.

## Estrutura

```
proxy/
├── Dockerfile            # baixa o binário OFICIAL do xmrig-proxy + roda a GUI
├── docker-compose.yml
├── package.json
├── src/
│   ├── server.js         # API + Basic Auth + servir a UI
│   ├── config.js         # config da GUI (via env vars)
│   ├── proxyManager.js   # start/stop/restart + buffer de logs
│   ├── proxyConfig.js    # ler/escrever config.json do xmrig-proxy
│   └── proxyApi.js       # consome a API HTTP do xmrig-proxy
└── public/               # UI web (HTML/CSS/JS)
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `GUI_USER` | `admin` | Usuário do Basic Auth da GUI |
| `GUI_PASS` | `admin` | **Troque!** Senha do Basic Auth |
| `GUI_PORT` | `8080` | Porta da GUI web |
| `PROXY_API_PORT` | `8081` | Porta da API HTTP do xmrig-proxy |
| `PROXY_API_TOKEN` | `changeme-token` | Token da API do proxy |
| `AUTO_START` | `false` | Se `true`, inicia o proxy junto com o container |
| `DATA_DIR` | `/data` | Onde o `config.json` é persistido |

## Deploy no EasyPanel

1. **Crie um App** do tipo **App** (ou via Git/Dockerfile).
2. Aponte para este repositório (ou faça upload). O EasyPanel usa o `Dockerfile`.
3. Em **Environment**, defina pelo menos:
   - `GUI_USER`, `GUI_PASS` (senha forte!)
   - `PROXY_API_TOKEN`
   - `AUTO_START=true`
4. Em **Mounts/Volumes**, monte um volume em `/data` para o `config.json` sobreviver a redeploys.
5. Em **Ports/Domains**:
   - Exponha a porta **8080** com um domínio (a GUI). O EasyPanel coloca HTTPS automático.
   - Exponha a porta **3333** (TCP) — é onde os seus mineradores vão conectar. Em EasyPanel, use **TCP proxy / port mapping** para 3333.
6. Faça o **Deploy**. Acesse o domínio da GUI, faça login.
7. Na seção **Configuração do proxy** (formulário visual), preencha:
   - **URL do pool** → ex.: `xmr.pool.com:443`
   - **Carteira / usuário** → sua carteira / login do pool
   - **TLS** → marque se a porta do pool for SSL
   - **Porta de mineração** → `0.0.0.0:3333` (porta que os miners usam)
   - Clique em **Salvar config**. A GUI gera o `config.json` e o proxy reinicia com a nova config.

## Apontar os mineradores

Em cada máquina (xmrig comum), aponte o pool para o **proxy**, não para o pool real:

```json
{
  "pools": [
    { "url": "SEU_HOST_EASYPANEL:3333", "user": "nome-da-rig", "pass": "x", "keepalive": true, "tls": false }
  ]
}
```

Assim, **toda mudança de pool/carteira você faz só no proxy** pela GUI, e todas as máquinas seguem automaticamente.

## Rodar localmente (teste)

```bash
docker compose up --build
# GUI: http://localhost:8080  (admin / troque-esta-senha)
```

## Notas

- A seção `http` do config é forçada a `enabled: true` ao salvar, senão a GUI não consegue ler stats.
- A versão do binário é controlada pelo build arg `XMRIG_PROXY_VERSION` no Dockerfile/compose.
