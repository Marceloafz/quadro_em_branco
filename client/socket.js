const SERVIDOR = window.location.origin;

const socket = io(SERVIDOR, {
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});

// ── Conexão

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

// ── State catch-up
// Ao entrar na sessão, o servidor reenvia todos os traços já existentes.
// Cada traço é renderizado via window.desenharTraco (definido em canvas.js).

socket.on('historico', (tracos) => {
  tracos.forEach((t) => window.desenharTraco(t));
});

// ── Recepção de traços remotos
// Filtra o próprio traço (já desenhado localmente) pelo autorId,
// evitando duplicação, e renderiza apenas os traços dos outros usuários.

socket.on('desenho', (dados) => {
  if (dados.autorId !== socket.id) {
    window.desenharTraco(dados);
  }
});

// ── Limpeza do quadro

socket.on('limpar', () => {
  window.limparCanvas();
});


// Armazena os usuários conectados
const usuariosOnline = {};

// Recebe a lista completa enviada pelo servidor
socket.on('usuarios:lista', (usuarios) => {
  Object.assign(usuariosOnline, usuarios);
  atualizarListaUsuarios();
});

// Notificação de entrada
socket.on('cliente:entrou', ({ id, apelido, cor }) => {
  mostrarNotificacao(`${apelido} entrou na sessão`);
});

// Atualização quando alguém sai
socket.on('cliente:saiu', ({ id, motivo }) => {
  delete usuariosOnline[id];

  atualizarListaUsuarios();

  window.removerCursor(id);

  mostrarNotificacao(`Um usuário saiu da sessão`);
});

// Atualiza a lista visual de usuários
function atualizarListaUsuarios() {
  const lista = document.getElementById('listaUsuarios');

  if (!lista) return;

  lista.innerHTML = '';

  Object.values(usuariosOnline).forEach((usuario) => {
    const item = document.createElement('div');

    item.innerHTML = `
      <span
        style="
          display:inline-block;
          width:10px;
          height:10px;
          border-radius:50%;
          background:${usuario.cor};
          margin-right:6px;
        ">
      </span>
      ${usuario.apelido}
    `;

    lista.appendChild(item);
  });
}

// Exibe notificações temporárias
function mostrarNotificacao(mensagem) {
  const aviso = document.createElement('div');

  aviso.className = 'notificacao';
  aviso.textContent = mensagem;

  document.body.appendChild(aviso);

  setTimeout(() => {
    aviso.remove();
  }, 3000);
}

// ── Envio de eventos

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