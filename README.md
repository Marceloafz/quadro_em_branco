# Quadro Branco Colaborativo

Projeto de redes - quadro branco multiusuario em tempo real via WebSocket
(Socket.IO), empacotado como aplicativo de desktop com Electron.

## Estrutura

```
quadro_em_branco/
|- electron/
|  |- main.js              # processo principal: janelas, servidor e descoberta de hosts
|  |- launcher.html        # tela inicial (hospedar / entrar)
|  +- preload-launcher.js  # ponte segura entre launcher e main
|- server/
|  |- server.js            # servidor HTTP + Socket.IO e arquivos estaticos
|  |- teste-integracao.js  # teste de integracao cliente/servidor
|  +- teste-lan.js         # teste de descoberta/conexao na LAN
|- client/
|  |- index.html           # interface do quadro
|  |- canvas.js            # desenho local (cores, espessura, borracha, salvar)
|  +- socket.js            # sincronizacao em tempo real e presenca de usuarios
+- shared/
   +- events.js            # nomes dos eventos compartilhados
```

## Como rodar

### 1. Instalar dependencias

```bash
npm install
```

### 2. Abrir o aplicativo

```bash
npm start
```

A tela inicial (launcher) oferece duas opcoes:

- **Hospedar** - inicia o servidor nesta maquina e abre o quadro. Outras
  maquinas na mesma rede aparecem automaticamente a lista de hosts.
- **Entrar** - conecta a um host descoberto na LAN com um clique, ou informe
  um IP manualmente (util para redes externas / Tailscale).

### Conexao em rede

- **LAN**: o host anuncia seu IP por broadcast UDP (porta 41234); os demais
  descobrem e entram sem digitar nada.
- **IP manual**: para redes onde o broadcast nao chega (ou via Tailscale),
  informe o IP do host, ex: `192.168.1.10` ou `100.x.x.x`.

A deteccao de IP local prefere faixas privadas reais (192.168.x, 10.x,
172.16-31.x) e Tailscale (100.64-127.x), ignorando enderecos APIPA
(169.254.x) e interfaces virtuais.

### Verificar se o servidor esta rodando

```
GET http://localhost:3000/health
-> { "status": "ok", "clientes": 2, "tracos": 137 }
```

## Funcionalidades do quadro

- Desenho colaborativo em tempo real entre varios usuarios.
- Paleta de cores, cor personalizada e espessura ajustavel.
- Borracha (atalho `B`) e salvar o quadro como PNG (atalho `Ctrl+S`).
- Limpar o quadro para todos.
- Painel de usuarios online com apelido e cor, e notificacoes de entrada/saida.

## Eventos Socket.IO

| Direcao | Evento | Payload |
|---|---|---|
| C -> S | `desenho` | `{ x0, y0, x1, y1, cor?, espessura? }` (coords 0-1) |
| C -> S | `limpar` | - |
| S -> C | `historico` | `DrawPayload[]` |
| S -> C | `usuarios:lista` | `{ [id]: { id, apelido, cor } }` |
| S -> C | `desenho` | `DrawPayload + autorId + ts` (coords 0-1) |
| S -> C | `limpar` | - |
| S -> C | `cliente:entrou` | `{ id, apelido, cor }` |
| S -> C | `cliente:saiu` | `{ id, motivo }` |
| S -> C | `erro` | `{ msg }` |

> As coordenadas dos tracos trafegam normalizadas (fracoes 0-1 do tamanho
> do canvas), para o desenho aparecer na mesma posicao relativa em telas
> de tamanhos diferentes.

## Testes

```bash
npm run test:integracao   # cliente/servidor
npm run test:lan          # descoberta/conexao na LAN
```

## Dependencias

| Pacote | Versao | Uso |
|---|---|---|
| socket.io | ^4.7.5 | Servidor WebSocket |
| socket.io-client | ^4.7.5 | Cliente nos testes |
| electron | ^31.7.7 | Aplicativo de desktop |
| nodemon | ^3.1.0 | Dev: hot reload |
