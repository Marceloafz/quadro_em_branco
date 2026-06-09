// ─────────────────────────────────────────────
//  socket.js  —  Sincronização em tempo real
//  Membro 3: Thiago Luiz
// ─────────────────────────────────────────────

const SERVIDOR = 'http://localhost:3000';

const socket = io(SERVIDOR, {
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});

// ── Conexão ──────────────────────────────────

socket.on('connect', () => {
  document.dispatchEvent(
    new CustomEvent('socket:conectado', { detail: socket.id })
  );
});

socket.on('disconnect', (motivo) => {
  document.dispatchEvent(
    new CustomEvent('socket:desconectado', { detail: motivo })
  );
});

// ── State catch-up ────────────────────────────
// Ao entrar na sessão, o servidor reenvia todos os traços já existentes.
// Cada traço é renderizado via window.desenharTraco (definido em canvas.js).

socket.on('historico', (tracos) => {
  tracos.forEach((t) => window.desenharTraco(t));
});

// ── Recepção de traços remotos ────────────────
// Filtra o próprio traço (já desenhado localmente) pelo autorId,
// evitando duplicação, e renderiza apenas os traços dos outros usuários.

socket.on('desenho', (dados) => {
  if (dados.autorId !== socket.id) {
    window.desenharTraco(dados);
  }
});

// ── Limpeza do quadro ─────────────────────────

socket.on('limpar', () => {
  window.limparCanvas();
});

// ── Presença (tratado pelo Membro 4) ──────────

socket.on('cliente:entrou', ({ id }) => {
  // Membro 4 (Igor) cuida da exibição da lista de presença
});

socket.on('cliente:saiu', ({ id, motivo }) => {
  window.removerCursor(id);
  // Membro 4 (Igor) cuida da atualização da lista de presença
});

// ── Envio de eventos ──────────────────────────

function enviarTraco(x0, y0, x1, y1, cor = '#000000', espessura = 3) {
  socket.emit('desenho', { x0, y0, x1, y1, cor, espessura });
}

function enviarLimpar() {
  socket.emit('limpar');
}

// API pública usada pelo canvas.js
window.wb = {
  enviarTraco,
  enviarLimpar,
  socketId: () => socket.id,
};
