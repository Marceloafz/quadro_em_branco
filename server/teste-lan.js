const { io } = require('socket.io-client');
const args = process.argv.slice(2);
const hostArg = args.indexOf('--host');
const HOST = hostArg !== -1 ? args[hostArg + 1] : 'localhost';
const URL = `http://${HOST}:3000`;
const N_CLIENTES = 5;

const C = {
  reset:  '\x1b[0m',
  verde:  '\x1b[32m',
  amarelo:'\x1b[33m',
  vermelho:'\x1b[31m',
  ciano:  '\x1b[36m',
  cinza:  '\x1b[90m',
  negrito:'\x1b[1m',
};
const ok   = (s) => `${C.verde}✓${C.reset} ${s}`;
const fail = (s) => `${C.vermelho}✗${C.reset} ${s}`;
const info = (s) => `${C.ciano}→${C.reset} ${s}`;
const dim  = (s) => `${C.cinza}${s}${C.reset}`;

const resultados = [];
let totalPassou = 0;
let totalFalhou = 0;

function registrar(teste, passou, detalhe = '') {
  resultados.push({ teste, passou, detalhe });
  if (passou) { totalPassou++; console.log(ok(teste) + (detalhe ? dim(` — ${detalhe}`) : '')); }
  else        { totalFalhou++; console.log(fail(teste) + (detalhe ? ` — ${C.vermelho}${detalhe}${C.reset}` : '')); }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function criarCliente(nome) {
  const socket = io(URL, { reconnection: false, timeout: 4000 });
  socket._nome = nome;
  return socket;
}

async function esperarEvento(socket, evento, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout aguardando "${evento}"`)), timeout);
    socket.once(evento, (dados) => { clearTimeout(t); resolve(dados); });
  });
}

async function rodar() {
  console.log(`\n${C.negrito}Quadro Branco — Teste de 5 clientes simultâneos${C.reset}`);
  console.log(dim(`Servidor: ${URL}\n`));

  console.log(info('Verificando servidor...'));
  const http = require('http');
  await new Promise((resolve) => {
    http.get(`${URL}/health`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          registrar('Servidor respondendo (/health)', json.status === 'ok', `status=${json.status}`);
        } catch {
          registrar('Servidor respondendo (/health)', false, 'resposta inválida');
        }
        resolve();
      });
    }).on('error', () => {
      registrar('Servidor respondendo (/health)', false, 'conexão recusada — rode "npm start" antes');
      resolve();
    });
  });

  if (totalFalhou > 0) {
    console.log(`\n${C.vermelho}Servidor inacessível. Inicie-o com "npm start" e tente novamente.${C.reset}\n`);
    process.exit(1);
  }

  console.log(info('\nConectando 5 clientes...'));
  const clientes = [];
  const promessasConexao = [];

  for (let i = 0; i < N_CLIENTES; i++) {
    const c = criarCliente(`Cliente-${i + 1}`);
    clientes.push(c);
    promessasConexao.push(
      esperarEvento(c, 'connect').then(() => c.id).catch(() => null)
    );
  }

  const ids = await Promise.all(promessasConexao);
  const conectados = ids.filter(Boolean).length;
  registrar(
    `${conectados}/${N_CLIENTES} clientes conectaram`,
    conectados === N_CLIENTES,
    ids.filter(Boolean).map((id) => id.slice(0, 6)).join(', ')
  );

  await esperar(200);

  console.log(info('\nTestando state catch-up...'));

  const tracosEnviados = [
    { x0: 10, y0: 10, x1: 50, y1: 50 },
    { x0: 60, y0: 20, x1: 100, y1: 80 },
    { x0: 5,  y0: 90, x1: 200, y1: 90 },
  ];
  for (const t of tracosEnviados) clientes[0].emit('desenho', t);
  await esperar(300);

  const clienteTardio = criarCliente('Cliente-6-tardio');
  const historicoPromessa = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 3000);
    clienteTardio.on('historico', (dados) => { clearTimeout(t); resolve(dados); });
  });
  await esperarEvento(clienteTardio, 'connect').catch(() => null);

  const historico = await historicoPromessa.catch(() => null);
  registrar(
    'Cliente tardio recebe histórico (state catch-up)',
    Array.isArray(historico) && historico.length >= tracosEnviados.length,
    historico ? `${historico.length} traço(s) no histórico` : 'histórico não recebido'
  );
  clienteTardio.disconnect();

  console.log(info('\nTestando rebroadcast de desenho...'));

  const remetente  = clientes[0];
  const receptores = clientes.slice(1);

  const promessasRecepcao = receptores.map((c) =>
    esperarEvento(c, 'desenho', 3000).catch(() => null)
  );

  const tracoTeste = { x0: 100, y0: 200, x1: 300, y1: 400, cor: '#ff0000', espessura: 5 };
  remetente.emit('desenho', tracoTeste);

  const recebidos = await Promise.all(promessasRecepcao);
  const chegaram  = recebidos.filter(Boolean).length;

  registrar(
    `Rebroadcast: ${chegaram}/${receptores.length} clientes receberam o traço`,
    chegaram === receptores.length,
    chegaram < receptores.length ? `${receptores.length - chegaram} não receberam` : ''
  );

  const amostra = recebidos.find(Boolean);
  if (amostra) {
    const camposOk = ['x0','y0','x1','y1','cor','espessura','autorId'].every((k) => k in amostra);
    registrar(
      'Payload do rebroadcast contém todos os campos esperados',
      camposOk,
      camposOk ? `autorId=${amostra.autorId?.slice(0,6)}` : `campos faltando: ${['x0','y0','x1','y1','cor','espessura','autorId'].filter(k => !(k in amostra)).join(', ')}`
    );
  }

  console.log(info('\nTestando validação de payload...'));
  const erroPromessa = esperarEvento(clientes[1], 'erro', 2000).catch(() => null);
  clientes[1].emit('desenho', { invalido: true });
  const erroRecebido = await erroPromessa;
  registrar(
    'Payload inválido gera evento "erro" de volta',
    erroRecebido !== null,
    erroRecebido ? `msg: "${erroRecebido.msg}"` : 'nenhum erro retornado'
  );

  console.log(info('\nTestando desconexão...'));

  const idQueVaiSair    = clientes[4].id;
  const promessaSaiu    = esperarEvento(clientes[0], 'cliente:saiu', 3000).catch(() => null);

  clientes[4].disconnect();
  const eventoSaiu = await promessaSaiu;

  registrar(
    'Desconexão notifica os demais (cliente:saiu)',
    eventoSaiu !== null && eventoSaiu.id === idQueVaiSair,
    eventoSaiu ? `id recebido: ${eventoSaiu.id?.slice(0,6)}` : 'evento não recebido'
  );

  console.log(info('\nTestando limpar quadro...'));

  const promessasLimpar = clientes.slice(0, 4).map((c) =>
    new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 3000);
      c.once('limpar', () => { clearTimeout(t); resolve(true); });
    })
  );
  clientes[0].emit('limpar');
  const limparRecebidos = (await Promise.all(promessasLimpar)).filter(Boolean).length;

  registrar(
    `Evento limpar propagado para ${limparRecebidos}/4 clientes restantes`,
    limparRecebidos === 4,
    limparRecebidos < 4 ? `${4 - limparRecebidos} não receberam` : ''
  );

  await esperar(200);
  const healthApos = await new Promise((resolve) => {
    http.get(`${URL}/health`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
  registrar(
    'Servidor ainda responde após eventos de limpar',
    healthApos?.status === 'ok',
    healthApos ? `clientes conectados: ${healthApos.clientes}` : 'falhou'
  );

  clientes.forEach((c) => c.connected && c.disconnect());
  await esperar(300);

  const total = totalPassou + totalFalhou;
  const cor   = totalFalhou === 0 ? C.verde : C.vermelho;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${C.negrito}Resultado: ${cor}${totalPassou}/${total} testes passaram${C.reset}`);
  if (totalFalhou === 0) {
    console.log(`${C.verde}${C.negrito}Módulo 1 (Marcelo Feitoza) — VALIDADO ✓${C.reset}`);
  } else {
    console.log(`${C.amarelo}Testes com falha:${C.reset}`);
    resultados.filter((r) => !r.passou).forEach((r) =>
      console.log(`  ${C.vermelho}•${C.reset} ${r.teste}${r.detalhe ? ` (${r.detalhe})` : ''}`)
    );
  }
  console.log();
  process.exit(totalFalhou > 0 ? 1 : 0);
}

rodar().catch((err) => {
  console.error(`\n${C.vermelho}Erro inesperado:${C.reset}`, err.message);
  process.exit(1);
});