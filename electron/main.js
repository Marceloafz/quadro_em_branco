const { app, BrowserWindow, ipcMain } = require('electron');
const dgram = require('dgram');
const path = require('path');
const os = require('os');

const SERVER_PORT = Number(process.env.PORT) || 3000;
const UDP_PORT = 41234;

let launcherWin = null;
let whiteboardWin = null;
let udpSocket = null;
let broadcastTimer = null;

// ── Utilitários ───────────────────────────────────────────────────────────────

// Retorna o IP LAN da máquina, ignorando interfaces virtuais e loopback.
// Prefere Wi-Fi e Ethernet; fallback para qualquer IPv4 não-interno.
function getLanIp() {
  const SKIP = /virtual|vmware|bluetooth/i;
  const ifaces = os.networkInterfaces();

  for (const [nome, addrs] of Object.entries(ifaces)) {
    if (SKIP.test(nome)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  for (const addrs of Object.values(ifaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

// ── Janelas ───────────────────────────────────────────────────────────────────

function criarLauncher() {
  launcherWin = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-launcher.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  launcherWin.loadFile(path.join(__dirname, 'launcher.html'));
  launcherWin.setMenuBarVisibility(false);
}

function abrirQuadro(url) {
  whiteboardWin = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  whiteboardWin.loadURL(url);
  whiteboardWin.setMenuBarVisibility(false);
  launcherWin?.close();
  launcherWin = null;
}

// ── Servidor ──────────────────────────────────────────────────────────────────

// Carrega server.js e inicia a escuta. O server.js detecta que não é o módulo
// principal (require.main !== module) e exporta o objeto http.Server em vez de
// chamar server.listen() sozinho.
function iniciarServidor() {
  return new Promise((resolve, reject) => {
    process.env.PORT = String(SERVER_PORT);
    let mod;
    try {
      mod = require('../server/server.js');
    } catch (err) {
      return reject(err);
    }
    mod.server.listen(SERVER_PORT, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// ── UDP ───────────────────────────────────────────────────────────────────────

function iniciarBroadcast(ip) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.bind(() => {
    sock.setBroadcast(true);
    const msg = Buffer.from(JSON.stringify({ ip, port: SERVER_PORT }));
    broadcastTimer = setInterval(() => {
      sock.send(msg, 0, msg.length, UDP_PORT, '255.255.255.255');
    }, 2000);
  });
  udpSocket = sock;
}

function ouvirBroadcast() {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const timeout = setTimeout(() => {
      try { sock.close(); } catch {}
      udpSocket = null;
      reject(new Error('Nenhum servidor encontrado na rede (30s)'));
    }, 30000);

    sock.on('message', (buf) => {
      try {
        const { ip, port } = JSON.parse(buf.toString());
        clearTimeout(timeout);
        sock.close();
        udpSocket = null;
        resolve(`http://${ip}:${port}`);
      } catch {}
    });

    sock.bind(UDP_PORT);
    udpSocket = sock;
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────────

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

ipcMain.on('entrar', async () => {
  launcherWin?.webContents.send('status', 'Buscando sessão na rede...');
  try {
    const url = await ouvirBroadcast();
    abrirQuadro(url);
  } catch (err) {
    launcherWin?.webContents.send('status', err.message, 'erro');
  }
});

ipcMain.on('cancelar', () => {
  try { udpSocket?.close(); } catch {}
  udpSocket = null;
});

ipcMain.on('conectar-ip', (_event, ip) => {
  const url = `http://${ip}:${SERVER_PORT}`;
  launcherWin?.webContents.send('status', `Conectando a ${ip}...`);
  abrirQuadro(url);
});

// ── Ciclo de vida ─────────────────────────────────────────────────────────────

app.whenReady().then(criarLauncher);

app.on('window-all-closed', () => {
  if (broadcastTimer) clearInterval(broadcastTimer);
  try { udpSocket?.close(); } catch {}
  app.quit();
});
