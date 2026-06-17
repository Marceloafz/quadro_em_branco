const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.resolve(__dirname, '..', 'client');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.css':  'text/css',
};

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clientes: io.sockets.size }));
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

io.on('connection', (socket) => {
  clientes.set(socket.id, { id: socket.id, entradaEm: Date.now() });

  socket.emit('historico', historico);
  socket.broadcast.emit('cliente:entrou', { id: socket.id });

  socket.on('desenho', (dados) => {
    if (!dadosValidos(dados)) {
      socket.emit('erro', { msg: 'payload inválido' });
      return;
    }
    historico.push({ ...dados, autorId: socket.id, ts: Date.now() });
    io.emit('desenho', { ...dados, autorId: socket.id });
  });

  socket.on('limpar', () => {
    historico.length = 0;
    io.emit('limpar');
  });

  socket.on('disconnect', (motivo) => {
    clientes.delete(socket.id);
    io.emit('cliente:saiu', { id: socket.id, motivo });
  });
});

function dadosValidos(d) {
  if (!d || typeof d !== 'object') return false;
  return ['x0', 'y0', 'x1', 'y1'].every((c) => typeof d[c] === 'number');
}

// Quando executado diretamente (`node server.js`), inicia a escuta.
// Quando carregado pelo Electron (require), exporta o server para que o main process controle quando a escuta começa.

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
} else {
  module.exports = { server, io, PORT };
}