const { app, BrowserWindow, ipcMain, screen } = require('electron');
const dgram = require('dgram');
const { exec, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');

const SERVER_PORT = Number(process.env.PORT) || 3000;
const UDP_PORT = 41234;
const HOST_TIMEOUT = 8000;

let launcherWin = null;
let whiteboardWin = null;
let broadcastSocket = null;
let listenerSocket = null;
let broadcastTimer = null;
let serverProcess = null;
const hostsEncontrados = new Map(); // ip → { ip, port, timer }

// ── Utilitários ───────────────────────────────────────────────────────────────

function getLanIp() {
  const SKIP_IFACE = /virtual|vmware|bluetooth/i;
  // 169.254.x.x = APIPA, sem gateway ativo
  const APIPA = (ip) => ip.startsWith('169.254.');
  // Faixas de adaptadores virtuais conhecidos — baixa prioridade
  const VIRTUAL_RANGE = /^(192\.168\.(56|224|57)\.|172\.(16|17|18|19)\.\d+\.1$)/;
  // Faixas privadas reais, em ordem de preferência
  const PREFER = [
    /^192\.168\.137\./, // hotspot Windows (ICS) — máxima prioridade
    /^192\.168\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Tailscale
  ];

  const ifaces = os.networkInterfaces();
  const candidatos = [];

  const virtuais = [];
  for (const [nome, addrs] of Object.entries(ifaces)) {
    if (SKIP_IFACE.test(nome)) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal || APIPA(addr.address)) continue;
      if (VIRTUAL_RANGE.test(addr.address)) virtuais.push(addr.address);
      else candidatos.push(addr.address);
    }
  }
  // Virtuais ficam no fim para desempate
  candidatos.push(...virtuais);

  for (const padrao of PREFER) {
    const match = candidatos.find((ip) => padrao.test(ip));
    if (match) return match;
  }

  return candidatos[0] || '127.0.0.1';
}

// ── Janelas ───────────────────────────────────────────────────────────────────

function criarLauncher() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const w = Math.min(420, Math.round(width * 0.35));
  const h = Math.min(420, Math.round(height * 0.55));

  launcherWin = new BrowserWindow({
    width: w,
    height: h,
    resizable: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-launcher.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  launcherWin.loadFile(path.join(__dirname, 'launcher.html'));
  launcherWin.setMenuBarVisibility(false);

  iniciarEscutaHosts();
}

function abrirQuadro(url) {
  pararEscutaHosts();

  whiteboardWin = new BrowserWindow({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  whiteboardWin.maximize();
  whiteboardWin.loadURL(url);
  whiteboardWin.setMenuBarVisibility(false);
  launcherWin?.close();
  launcherWin = null;
}

// ── Servidor ──────────────────────────────────────────────────────────────────

function abrirFirewall(port) {
  const tcp = `netsh advfirewall firewall add rule name="QuadroBranco-TCP-${port}" protocol=TCP dir=in localport=${port} action=allow`;
  const udp = `netsh advfirewall firewall add rule name="QuadroBranco-UDP-${UDP_PORT}" protocol=UDP dir=in localport=${UDP_PORT} action=allow`;
  exec(tcp, () => {});
  exec(udp, () => {});
}

function iniciarServidor() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', 'server', 'server.js');
    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, PORT: String(SERVER_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      const txt = data.toString();
      console.log('[servidor]', txt.trim());
      if (txt.includes('Servidor rodando')) {
        abrirFirewall(SERVER_PORT);
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[servidor erro]', data.toString().trim());
      reject(new Error(data.toString()));
    });

    serverProcess.on('error', reject);
  });
}

// ── UDP broadcast (host) ──────────────────────────────────────────────────────

function iniciarBroadcast(ip) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.bind(() => {
    sock.setBroadcast(true);
    const msg = Buffer.from(JSON.stringify({ ip, port: SERVER_PORT }));
    broadcastTimer = setInterval(() => {
      sock.send(msg, 0, msg.length, UDP_PORT, '255.255.255.255');
    }, 2000);
  });
  broadcastSocket = sock;
}

// ── UDP listener (launcher) ───────────────────────────────────────────────────

function enviarListaHosts() {
  const lista = [...hostsEncontrados.values()].map(({ ip, port }) => ({ ip, port }));
  launcherWin?.webContents.send('hosts-lista', lista);
}

function registrarHost(ip, port) {
  const existing = hostsEncontrados.get(ip);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    hostsEncontrados.delete(ip);
    enviarListaHosts();
  }, HOST_TIMEOUT);
  const isNovo = !hostsEncontrados.has(ip);
  hostsEncontrados.set(ip, { ip, port, timer });
  if (isNovo) enviarListaHosts();
}

function iniciarEscutaHosts() {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  sock.on('message', (buf) => {
    try {
      const { ip, port } = JSON.parse(buf.toString());
      registrarHost(ip, port);
    } catch {}
  });

  sock.bind(UDP_PORT);
  listenerSocket = sock;

  // Fallback HTTP: quando o cliente está no hotspot (192.168.137.x),
  // o host é sempre 192.168.137.1 — verifica via GET sem precisar de admin.
  iniciarSondagemHttp();
}

let sondagemTimer = null;

function iniciarSondagemHttp() {
  const meuIp = getLanIp();
  if (!meuIp.startsWith('192.168.137.') || meuIp === '192.168.137.1') return;

  const hostIp = '192.168.137.1';

  function sondar() {
    const req = http.get(
      { hostname: hostIp, port: SERVER_PORT, path: '/health', timeout: 2000 },
      (res) => {
        if (res.statusCode === 200) registrarHost(hostIp, SERVER_PORT);
        res.resume();
      }
    );
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
  }

  sondar();
  sondagemTimer = setInterval(sondar, 3000);
}

function pararSondagemHttp() {
  if (sondagemTimer) { clearInterval(sondagemTimer); sondagemTimer = null; }
}

function pararEscutaHosts() {
  pararSondagemHttp();
  hostsEncontrados.forEach(({ timer }) => clearTimeout(timer));
  hostsEncontrados.clear();
  try { listenerSocket?.close(); } catch {}
  listenerSocket = null;
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('get-ip', () => getLanIp());

ipcMain.on('hospedar', async () => {
  launcherWin?.webContents.send('status', 'Iniciando servidor...');
  try {
    await iniciarServidor();
    const ip = getLanIp();
    iniciarBroadcast(ip);
    abrirQuadro(`http://localhost:${SERVER_PORT}`);
  } catch (err) {
    launcherWin?.webContents.send('status', `Erro: ${err.message}`, 'erro');
  }
});

ipcMain.on('entrar-host', (_event, ip, port) => {
  abrirQuadro(`http://${ip}:${port}`);
});

ipcMain.on('conectar-ip', (_event, ip) => {
  launcherWin?.webContents.send('status', `Conectando a ${ip}...`);
  abrirQuadro(`http://${ip}:${SERVER_PORT}`);
});

// ── Ciclo de vida ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  abrirFirewall(SERVER_PORT);
  criarLauncher();
});

app.on('window-all-closed', () => {
  if (broadcastTimer) clearInterval(broadcastTimer);
  try { broadcastSocket?.close(); } catch {}
  try { listenerSocket?.close(); } catch {}
  serverProcess?.kill();
  app.quit();
});
