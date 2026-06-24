const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  hospedar:      () => ipcRenderer.send('hospedar'),
  entrarHost:    (ip, port) => ipcRenderer.send('entrar-host', ip, port),
  conectarIp:    (ip) => ipcRenderer.send('conectar-ip', ip),
  getIp:         () => ipcRenderer.invoke('get-ip'),
  onStatus:      (cb) => ipcRenderer.on('status', (_e, msg, tipo) => cb(msg, tipo)),
  onHostsLista:  (cb) => ipcRenderer.on('hosts-lista', (_e, lista) => cb(lista)),
});
