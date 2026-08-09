const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('juliaElectronV2', {
  mode: 'clean-shell',
  ownsMediaPipeline: false,
  sendTextMessage: (text) => ipcRenderer.invoke('julia:text:send', { text }),
  streamTextMessage: (requestId, text) => ipcRenderer.invoke('julia:text:stream', { requestId, text }),
  onTextStreamEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('julia:text:stream-event', handler);
    return () => ipcRenderer.removeListener('julia:text:stream-event', handler);
  },
  listConversations: () => ipcRenderer.invoke('julia:conversation:list'),
  getCurrentConversation: () => ipcRenderer.invoke('julia:conversation:current'),
  createConversation: (title) => ipcRenderer.invoke('julia:conversation:create', { title }),
  openConversation: (conversationId) => ipcRenderer.invoke('julia:conversation:open', { conversationId }),
  addConversationMessage: (conversationId, message) => ipcRenderer.invoke('julia:conversation:add-message', {
    conversationId,
    message,
  }),
  renameConversation: (conversationId, title) => ipcRenderer.invoke('julia:conversation:rename', {
    conversationId,
    title,
  }),
  deleteConversation: (conversationId) => ipcRenderer.invoke('julia:conversation:delete', { conversationId }),
  searchConversations: (query) => ipcRenderer.invoke('julia:conversation:search', { query }),
  getSettings: () => ipcRenderer.invoke('julia:settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('julia:settings:update', settings),
  getBrainStatus: () => ipcRenderer.invoke('julia:brain:status'),
  showApp: () => ipcRenderer.invoke('julia:app:show'),
  hideApp: () => ipcRenderer.invoke('julia:app:hide')
});
