const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  hospedar: () => ipcRenderer.send('hospedar'),
  entrar:   () => ipcRenderer.send('entrar'),
  cancelar: () => ipcRenderer.send('cancelar'),
  onStatus: (cb) => ipcRenderer.on('status', (_event, msg, tipo) => cb(msg, tipo)),
});
