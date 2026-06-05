const SERVIDOR = 'http://localhost:3000';

const socket = io(SERVIDOR, {
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});


socket.on('connect', () => {
  document.dispatchEvent(new CustomEvent('socket:conectado', { detail: socket.id }));
});

socket.on('historico', (tracos) => {
  tracos.forEach((t) => desenharTraco(t));
});

socket.on('desenho', (dados) => {
  if (dados.autorId !== socket.id) {
    desenharTraco(dados);
  }
});

socket.on('limpar', () => {
  limparCanvas();
});

socket.on('cliente:entrou', ({ id }) => {
});

socket.on('cliente:saiu', ({ id, motivo }) => {
  removerCursor(id);
});

socket.on('disconnect', (motivo) => {
  document.dispatchEvent(new CustomEvent('socket:desconectado', { detail: motivo }));
});


function enviarTraco(x0, y0, x1, y1, cor = '#000000', espessura = 3) {
  socket.emit('desenho', { x0, y0, x1, y1, cor, espessura });
}

function enviarLimpar() {
  socket.emit('limpar');
}

function desenharTraco(dados) {}
function limparCanvas() {}
function removerCursor(id) {}

window.wb = { enviarTraco, enviarLimpar, socketId: () => socket.id };