const { app, BrowserWindow, ipcMain, screen } = require('electron');
const dgram = require('dgram');
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
const hostsEncontrados = new Map(); // ip → { ip, port, timer }

// ── Utilitários ───────────────────────────────────────────────────────────────

function getLanIp() {
  const SKIP_IFACE = /virtual|vmware|bluetooth/i;
  // 169.254.x.x = APIPA, sem gateway ativo
  const APIPA = (ip) => ip.startsWith('169.254.');
  // Faixas privadas reais, em ordem de preferência
  const PREFER = [
    /^192\.168\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Tailscale
  ];

  const ifaces = os.networkInterfaces();
  const candidatos = [];

  for (const [nome, addrs] of Object.entries(ifaces)) {
    if (SKIP_IFACE.test(nome)) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal || APIPA(addr.address)) continue;
      candidatos.push(addr.address);
    }
  }

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

function iniciarServidor() {
  return new Promise((resolve, reject) => {
    process.env.PORT = String(SERVER_PORT);
    let mod;
    try { mod = require('../server/server.js'); } catch (err) { return reject(err); }
    mod.server.listen(SERVER_PORT, (err) => {
      if (err) return reject(err);
      resolve();
    });
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

function iniciarEscutaHosts() {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  sock.on('message', (buf) => {
    try {
      const { ip, port } = JSON.parse(buf.toString());
      const existing = hostsEncontrados.get(ip);
      if (existing?.timer) clearTimeout(existing.timer);

      const timer = setTimeout(() => {
        hostsEncontrados.delete(ip);
        enviarListaHosts();
      }, HOST_TIMEOUT);

      const isNovo = !hostsEncontrados.has(ip);
      hostsEncontrados.set(ip, { ip, port, timer });
      if (isNovo) enviarListaHosts();
    } catch {}
  });

  sock.bind(UDP_PORT);
  listenerSocket = sock;
}

function pararEscutaHosts() {
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

app.whenReady().then(criarLauncher);

app.on('window-all-closed', () => {
  if (broadcastTimer) clearInterval(broadcastTimer);
  try { broadcastSocket?.close(); } catch {}
  try { listenerSocket?.close(); } catch {}
  app.quit();
});
