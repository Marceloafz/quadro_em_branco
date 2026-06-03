# Quadro Branco Colaborativo

Projeto de redes — quadro branco multiusuário em tempo real via WebSocket.

## Estrutura

```
whiteboard/
├── server/
│   ├── server.js        
│   └── package.json
├── client/
│   ├── index.html       
│   └── socket.js        
└── shared/
    └── events.js        
```

## Como rodar

### 1. Instalar dependências

```bash
cd server
npm install
```

### 2. Iniciar o servidor

```bash
# produção
npm start

# desenvolvimento (reinicia ao salvar)
npm run dev
```

### 3. Abrir o cliente

Abra `client/index.html` em dois ou mais navegadores (ou abas) na mesma rede.

> Na LAN: outros dispositivos devem usar o IP da máquina que roda o servidor,
> ex: `http://192.168.1.10:3000`.

### Verificar se o servidor está rodando

```
GET http://localhost:3000/health
→ { "status": "ok", "clientes": 2 }
```

## Eventos Socket.IO

| Direção | Evento | Payload |
|---|---|---|
| C → S | `desenho` | `{ x0, y0, x1, y1, cor?, espessura? }` |
| C → S | `limpar` | — |
| S → C | `historico` | `DrawPayload[]` |
| S → C | `desenho` | `DrawPayload + autorId + ts` |
| S → C | `limpar` | — |
| S → C | `cliente:entrou` | `{ id }` |
| S → C | `cliente:saiu` | `{ id, motivo }` |
| S → C | `erro` | `{ msg }` |

## Dependências

| Pacote | Versão | Uso |
|---|---|---|
| socket.io | ^4.7.5 | WebSocket server |
| nodemon | ^3.1.0 | Dev: hot reload |
