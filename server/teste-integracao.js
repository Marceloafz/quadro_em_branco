const { io } = require('socket.io-client');
const http = require('http');

const args = process.argv.slice(2);
const hostArg = args.indexOf('--host');
const HOST = hostArg !== -1 ? args[hostArg + 1] : 'localhost';
const URL = `http://${HOST}:3000`;
const N_CLIENTES = 5;
const APELIDOS = ['Iago', 'Marcelo', 'Leonardo', 'Thiago', 'Igor'];

const C = {
  reset: '\x1b[0m',
  verde: '\x1b[32m',
  amarelo: '\x1b[33m',
  vermelho: '\x1b[31m',
  ciano: '\x1b[36m',
  cinza: '\x1b[90m',
  negrito: '\x1b[1m',
};
const ok = (s) => `${C.verde}✓${C.reset} ${s}`;
const fail = (s) => `${C.vermelho}✗${C.reset} ${s}`;
const warn = (s) => `${C.amarelo}⚠${C.reset} ${s}`;
const info = (s) => `${C.ciano}→${C.reset} ${s}`;
const dim = (s) => `${C.cinza}${s}${C.reset}`;

const resultados = [];
let totalPassou = 0;
let totalFalhou = 0;
let totalAviso = 0;

// status: true = passou // false = falhou // 'aviso' = pendência não-bloqueante
function registrar(teste, status, detalhe = '') {
  resultados.push({ teste, status, detalhe });
  if (status === true) {
    totalPassou++;
    console.log(ok(teste) + (detalhe ? dim(` — ${detalhe}`) : ''));
  } else if (status === 'aviso') {
    totalAviso++;
    console.log(warn(teste) + (detalhe ? dim(` — ${detalhe}`) : ''));
  } else {
    totalFalhou++;
    console.log(fail(teste) + (detalhe ? ` — ${C.vermelho}${detalhe}${C.reset}` : ''));
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function criarCliente(nome) {
  const socket = io(URL, { reconnection: false, timeout: 4000 });
  socket._nome = nome;
  return socket;
}

function esperarEvento(socket, evento, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout aguardando "${evento}"`)), timeout);
    socket.once(evento, (dados) => {
      clearTimeout(t);
      resolve(dados);
    });
  });
}

async function rodar() {
  console.log(`\n${C.negrito}Quadro Branco — Teste de Integração (Membro 5: Iago Henrique)${C.reset}`);
  console.log(dim(`Servidor: ${URL}\n`));

  //  1. Servidor no ar 
  console.log(info('1. Verificando se o servidor está no ar...'));
  await new Promise((resolve) => {
    http
      .get(`${URL}/health`, (res) => {
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
      })
      .on('error', () => {
        registrar('Servidor respondendo (/health)', false, 'conexão recusada — rode "npm start" no servidor antes');
        resolve();
      });
  });

  if (totalFalhou > 0) {
    console.log(`\n${C.vermelho}Servidor inacessível. Abortando teste de integração.${C.reset}\n`);
    process.exit(1);
  }

  //  2. Conectar 5 clientes
  console.log(info('\n2. Conectando 5 clientes simultâneos...'));
  const clientes = APELIDOS.slice(0, N_CLIENTES).map((nome) => criarCliente(nome));

  const ids = await Promise.all(
    clientes.map((c) => esperarEvento(c, 'connect').then(() => c.id).catch(() => null))
  );
  registrar(
    `${ids.filter(Boolean).length}/${N_CLIENTES} clientes conectaram`,
    ids.filter(Boolean).length === N_CLIENTES,
    ids.filter(Boolean).map((id) => id.slice(0, 6)).join(', ')
  );

  //  3. Identificação / apelido (M4)
  console.log(info('\n3. Testando identificação por apelido (Membro 4)...'));
  clientes.forEach((c, i) => c.emit('entrar', { apelido: APELIDOS[i] }));
  await esperar(200);

  const listaPromessa = esperarEvento(clientes[0], 'usuarios:lista', 2000).catch(() => null);
  // conecta um cliente extra para forçar uma nova emissão de "usuarios:lista"
  const extra = criarCliente('Extra');
  await esperarEvento(extra, 'connect').catch(() => null);
  extra.emit('entrar', { apelido: 'Extra' });
  const lista = await listaPromessa;

  if (lista && typeof lista === 'object' && Object.keys(lista).length > 0) {
    const usuarios = Object.values(lista);
    const temApelidoECor = usuarios.every((u) => u.apelido && u.cor);
    registrar(
      'Servidor mantém mapa {id → {apelido, cor}} e emite "usuarios:lista"',
      temApelidoECor,
      `${usuarios.length} usuário(s) na lista`
    );
  } else {
    registrar(
      'Servidor mantém mapa {id → {apelido, cor}} e emite "usuarios:lista"',
      'aviso',
      'evento não recebido — falta implementar no server.js (Membro 4): receber "entrar", atribuir cor da paleta e emitir "usuarios:lista"'
    );
  }
  extra.disconnect();

  //  4. "cliente:entrou" com apelido e cor
  console.log(info('\n4. Testando notificação "cliente:entrou" com apelido/cor...'));
  const entrouPromessa = esperarEvento(clientes[0], 'cliente:entrou', 2000).catch(() => null);
  const novo = criarCliente('Novato');
  await esperarEvento(novo, 'connect').catch(() => null);
  novo.emit('entrar', { apelido: 'Novato' });
  const evtEntrou = await entrouPromessa;

  if (evtEntrou && evtEntrou.apelido && evtEntrou.cor) {
    registrar('"cliente:entrou" carrega apelido e cor do novo usuário', true, `apelido=${evtEntrou.apelido}, cor=${evtEntrou.cor}`);
  } else {
    registrar(
      '"cliente:entrou" carrega apelido e cor do novo usuário',
      'aviso',
      evtEntrou ? `recebido apenas: ${JSON.stringify(evtEntrou)}` : 'evento não recebido — server.js ainda emite só { id }'
    );
  }

  //  5. State catch-up (M1 + M3)
  console.log(info('\n5. Testando state catch-up (entrar depois de traços existirem)...'));
  const tracosIniciais = [
    { x0: 10, y0: 10, x1: 50, y1: 50, cor: '#ff0000', espessura: 4 },
    { x0: 60, y0: 20, x1: 100, y1: 80, cor: '#3b82f6', espessura: 6 },
  ];
  tracosIniciais.forEach((t) => clientes[0].emit('desenho', t));
  await esperar(300);

  const tardio = criarCliente('Tardio');
  const histPromessa = esperarEvento(tardio, 'historico', 3000).catch(() => null);
  await esperarEvento(tardio, 'connect').catch(() => null);
  const historico = await histPromessa;

  registrar(
    'Cliente que entra depois recebe histórico completo (catch-up)',
    Array.isArray(historico) && historico.length >= tracosIniciais.length,
    historico ? `${historico.length} traço(s) recebido(s)` : 'histórico não recebido'
  );
  tardio.disconnect();
  novo.disconnect();

  //  6. Desenho simultâneo + latência (M1 + M2 + M3)
  console.log(info('\n6. Testando 5 clientes desenhando simultaneamente (consistência + latência)...'));
  const recepcoes = clientes.map(() => 0);
  const latencias = [];

  clientes.forEach((c, i) => {
    c.on('desenho', (dados) => {
      if (dados.autorId !== c.id) {
        recepcoes[i]++;
        if (typeof dados._ts === 'number') latencias.push(Date.now() - dados._ts);
      }
    });
  });

  clientes.forEach((c, i) => {
    c.emit('desenho', {
      x0: 10 * i,
      y0: 10 * i,
      x1: 50 + 10 * i,
      y1: 50 + 10 * i,
      cor: '#000000',
      espessura: 3,
      _ts: Date.now(), // usado apenas para medir latência local
    });
  });

  await esperar(500);

  const esperado = N_CLIENTES - 1; // cada cliente deve receber os traços dos outros 4
  const todosReceberam = recepcoes.every((r) => r >= esperado);
  registrar(
    `Todos os clientes recebem os traços dos demais (${esperado} cada, sem duplicar o próprio)`,
    todosReceberam,
    `recebidos por cliente: [${recepcoes.join(', ')}]`
  );

  if (latencias.length > 0) {
    const media = (latencias.reduce((a, b) => a + b, 0) / latencias.length).toFixed(1);
    const max = Math.max(...latencias);
    registrar('Latência percebida de rebroadcast medida', true, `média=${media}ms, máx=${max}ms (referência local)`);
  } else {
    registrar('Latência percebida de rebroadcast medida', false, 'nenhum evento com timestamp recebido');
  }

  //  7. Desconexão abrupta (M1 + M4) ─
  console.log(info('\n7. Testando desconexão abrupta...'));
  const idQueVaiSair = clientes[4].id;
  const promessaSaiu = esperarEvento(clientes[0], 'cliente:saiu', 3000).catch(() => null);
  const promessaLista = esperarEvento(clientes[0], 'usuarios:lista', 3000).catch(() => null);

  clientes[4].disconnect();
  const [evtSaiu, listaAtualizada] = await Promise.all([promessaSaiu, promessaLista]);

  registrar(
    'Desconexão notifica os demais ("cliente:saiu")',
    evtSaiu !== null && evtSaiu.id === idQueVaiSair,
    evtSaiu ? `id=${evtSaiu.id.slice(0, 6)}, motivo=${evtSaiu.motivo}` : 'evento não recebido'
  );

  if (listaAtualizada) {
    const aindaPresente = Object.keys(listaAtualizada).includes(idQueVaiSair);
    registrar(
      'Lista de presença é atualizada após a desconexão',
      !aindaPresente,
      `usuário ${aindaPresente ? 'ainda aparece' : 'foi removido'} em "usuarios:lista"`
    );
  } else {
    registrar(
      'Lista de presença é atualizada após a desconexão',
      'aviso',
      '"usuarios:lista" não foi reemitido na saída — verificar Membro 4'
    );
  }

  //  8. Limpar quadro (M1 + M2)
  console.log(info('\n8. Testando botão "Limpar quadro" propagado a todos...'));
  const restantes = clientes.slice(0, 4);
  const promessasLimpar = restantes.map(
    (c) =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), 2000);
        c.once('limpar', () => {
          clearTimeout(t);
          resolve(true);
        });
      })
  );
  clientes[0].emit('limpar');
  const limparOk = (await Promise.all(promessasLimpar)).filter(Boolean).length;
  registrar(`Evento "limpar" propagado para ${limparOk}/${restantes.length} clientes restantes`, limparOk === restantes.length);

  //  Encerrar conexões 
  clientes.forEach((c) => c.connected && c.disconnect());
  await esperar(200);

  //  Resumo final ─
  const total = totalPassou + totalFalhou + totalAviso;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(
    `${C.negrito}Resultado: ${C.verde}${totalPassou} passaram${C.reset}, ` +
      `${C.vermelho}${totalFalhou} falharam${C.reset}, ` +
      `${C.amarelo}${totalAviso} pendente(s)${C.reset} — de ${total} verificações`
  );

  if (totalAviso > 0) {
    console.log(`\n${C.amarelo}Pendências (funcionalidades do Membro 4 ainda não integradas no servidor):${C.reset}`);
    resultados
      .filter((r) => r.status === 'aviso')
      .forEach((r) => console.log(`  ${C.amarelo}•${C.reset} ${r.teste}${r.detalhe ? ` (${r.detalhe})` : ''}`));
  }
  if (totalFalhou > 0) {
    console.log(`\n${C.vermelho}Falhas:${C.reset}`);
    resultados
      .filter((r) => r.status === false)
      .forEach((r) => console.log(`  ${C.vermelho}•${C.reset} ${r.teste}${r.detalhe ? ` (${r.detalhe})` : ''}`));
  }
  if (totalFalhou === 0 && totalAviso === 0) {
    console.log(`\n${C.verde}${C.negrito}Integração completa — todos os módulos validados ✓${C.reset}`);
  }
  console.log();
  process.exit(totalFalhou > 0 ? 1 : 0);
}

rodar().catch((err) => {
  console.error(`\n${C.vermelho}Erro inesperado:${C.reset}`, err.message);
  process.exit(1);
});