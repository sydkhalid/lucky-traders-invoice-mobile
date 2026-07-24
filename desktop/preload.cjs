const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('luckyTradersDesktop', {
  platform: process.platform,
});
