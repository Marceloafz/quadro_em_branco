const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clientes: io.engine.clientsCount }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
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
  const campos = ['x0', 'y0', 'x1', 'y1'];
  return campos.every((c) => typeof d[c] === 'number');
}

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});