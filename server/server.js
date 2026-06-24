const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.resolve(__dirname, '..', 'client');

// Limite de tracos guardados em memoria. Evita crescimento ilimitado do
// historico em sessoes longas; os mais antigos sao descartados primeiro.
const HISTORICO_MAX = 20000;

// Paleta usada para dar uma cor de identificacao a cada usuario conectado.
const CORES_USUARIO = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#14b8a6', '#6366f1',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.css':  'text/css',
};

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      clientes: clientes.size,
      tracos: historico.length,
    }));
    return;
  }

  const pathname = req.url.split('?')[0];
  const filePath = path.resolve(
    CLIENT_DIR,
    pathname === '/' ? 'index.html' : pathname.slice(1)
  );

  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const historico = [];
const clientes = new Map();
let contadorUsuarios = 0;

// Monta o objeto { id: { id, apelido, cor } } enviado ao cliente.
function listaUsuarios() {
  const lista = {};
  for (const [id, info] of clientes) {
    lista[id] = { id, apelido: info.apelido, cor: info.cor };
  }
  return lista;
}

io.on('connection', (socket) => {
  contadorUsuarios += 1;
  const apelido = `Usuario ${contadorUsuarios}`;
  const cor = CORES_USUARIO[(contadorUsuarios - 1) % CORES_USUARIO.length];
  clientes.set(socket.id, { id: socket.id, apelido, cor, entradaEm: Date.now() });

  // Estado inicial para quem acabou de entrar.
  socket.emit('historico', historico);
  socket.emit('usuarios:lista', listaUsuarios());

  // Avisa os demais e atualiza a lista de todos.
  socket.broadcast.emit('cliente:entrou', { id: socket.id, apelido, cor });
  io.emit('usuarios:lista', listaUsuarios());

  socket.on('desenho', (dados) => {
    if (!dadosValidos(dados)) {
      socket.emit('erro', { msg: 'payload invalido' });
      return;
    }
    const traco = { ...dados, autorId: socket.id, ts: Date.now() };
    historico.push(traco);
    if (historico.length > HISTORICO_MAX) {
      historico.splice(0, historico.length - HISTORICO_MAX);
    }
    io.emit('desenho', traco);
  });

  socket.on('limpar', () => {
    historico.length = 0;
    io.emit('limpar');
  });

  socket.on('disconnect', (motivo) => {
    clientes.delete(socket.id);
    io.emit('cliente:saiu', { id: socket.id, motivo });
    io.emit('usuarios:lista', listaUsuarios());
  });
});

function dadosValidos(d) {
  if (!d || typeof d !== 'object') return false;
  return ['x0', 'y0', 'x1', 'y1'].every((c) => typeof d[c] === 'number');
}

// Quando executado diretamente (`node server.js`), inicia a escuta.
// Quando carregado pelo Electron (require), exporta o server para que o
// main process controle quando a escuta comeca.

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
} else {
  module.exports = { server, io, PORT };
}
