const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  getSettings: () => ipcRenderer.invoke('pet:get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('pet:set-setting', key, value),
  setScale: (scale) => ipcRenderer.invoke('pet:set-scale', scale),
  resetPosition: () => ipcRenderer.invoke('pet:reset-position'),
  quit: () => ipcRenderer.send('pet:quit'),
  hide: () => ipcRenderer.send('pet:hide'),
  dragStart: (point) => ipcRenderer.send('pet:drag-start', point),
  dragMove: (point) => ipcRenderer.send('pet:drag-move', point),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  onPoke: (handler) => ipcRenderer.on('pet:poke', () => handler()),
  onState: (handler) => ipcRenderer.on('pet:state', (_event, value) => handler(value)),
});
