const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  hospedar:    () => ipcRenderer.send('hospedar'),
  entrar:      () => ipcRenderer.send('entrar'),
  cancelar:    () => ipcRenderer.send('cancelar'),
  conectarIp:  (ip) => ipcRenderer.send('conectar-ip', ip),
  onStatus:    (cb) => ipcRenderer.on('status', (_event, msg, tipo) => cb(msg, tipo)),
});
