const defaultTextClient = require('./text-client');

function createConversationIpcHandlers({
  getConversationStore,
  getTextClientOptions,
  textClient = defaultTextClient,
}) {
  function cacheCoreConversationSummaries(items = []) {
    const store = getConversationStore();
    return items.map((item) => store.createConversationWithId(
      item.conversation_id,
      item.title || 'New Conversation'
    ));
  }

  async function listCoreConversationProjection(query = '') {
    const items = await textClient.listConversationsViaCore(getTextClientOptions());
    cacheCoreConversationSummaries(items);
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return items;

    const matched = [];
    for (const item of items) {
      const title = String(item.title || '').toLowerCase();
      if (title.includes(needle)) {
        matched.push({ ...item, match_count: 1, match_snippet: item.title });
        continue;
      }
      try {
        const canonical = await textClient.getConversationMessages(item.conversation_id, getTextClientOptions());
        const reconciled = getConversationStore()
          .reconcileCanonicalMessages(item.conversation_id, canonical)
          .conversation;
        const message = reconciled.messages.find((m) => String(m.content || '').toLowerCase().includes(needle));
        if (message) matched.push({
          ...item,
          match_count: 1,
          match_snippet: String(message.content || '').slice(0, 80),
        });
      } catch (error) {
        getConversationStore().markConversationStale(item.conversation_id, error.message);
      }
    }
    return matched;
  }

  async function syncCoreConversationProjection(conversationId, title = 'New Conversation') {
    const canonical = await textClient.ensureConversationMessages(
      conversationId,
      title,
      getTextClientOptions()
    );
    return getConversationStore().reconcileCanonicalMessages(conversationId, canonical).conversation;
  }

  async function getCurrentCoreConversationProjection() {
    const cached = getConversationStore().getCachedCurrentConversation();
    if (cached?.conversation_id) {
      try {
        return await syncCoreConversationProjection(cached.conversation_id, cached.title || 'New Conversation');
      } catch (error) {
        if (error.status !== 404) {
          getConversationStore().markConversationStale(cached.conversation_id, error.message);
          return cached;
        }
      }
    }

    const items = await textClient.listConversationsViaCore(getTextClientOptions());
    cacheCoreConversationSummaries(items);
    if (items.length > 0) {
      const first = items[0];
      return syncCoreConversationProjection(first.conversation_id, first.title || 'New Conversation');
    }

    const canonical = await textClient.createConversationViaCore('New Conversation', getTextClientOptions());
    return getConversationStore().createConversationWithId(
      canonical.conversation_id,
      canonical.title || 'New Conversation'
    );
  }

  return {
    'julia:conversation:list': async () => listCoreConversationProjection(),
    'julia:conversation:current': async () => getCurrentCoreConversationProjection(),
    'julia:conversation:create': async (_event, input) => {
      const title = input?.title || 'New Conversation';
      const canonical = await textClient.createConversationViaCore(title, getTextClientOptions());
      return getConversationStore().createConversationWithId(canonical.conversation_id, canonical.title || title);
    },
    'julia:conversation:open': async (_event, input) => {
      const conversationId = String(input?.conversationId || '').trim();
      if (!conversationId) throw new Error('Conversation ID is required');
      return syncCoreConversationProjection(conversationId);
    },
    'julia:conversation:add-message': async (_event, input) => {
      return getConversationStore().addMessage(input?.conversationId, input?.message || {});
    },
    'julia:conversation:rename': async (_event, input) => {
      return getConversationStore().renameConversation(input?.conversationId, input?.title);
    },
    'julia:conversation:delete': async (_event, input) => {
      return getConversationStore().deleteConversation(input?.conversationId);
    },
    'julia:conversation:search': async (_event, input) => {
      return listCoreConversationProjection(input?.query);
    },
    'julia:cache:status': async () => {
      return getConversationStore().getCacheStatus();
    },
    'julia:cache:clear-local': async () => {
      return getConversationStore().clearLocalCache();
    },
    'julia:conversation:sync': async (_event, input) => {
      const conversationId = String(input?.conversationId || '').trim();
      if (!conversationId) throw new Error('Conversation ID is required');
      const cached = getConversationStore().getConversation(conversationId);
      let canonical;
      try {
        canonical = await textClient.ensureConversationMessages(
          conversationId,
          cached?.title || 'New Conversation',
          getTextClientOptions()
        );
      } catch (error) {
        getConversationStore().markConversationStale(conversationId, error.message);
        throw error;
      }
      return {
        ...getConversationStore().reconcileCanonicalMessages(conversationId, canonical),
        canonical: {
          conversation_id: canonical.conversation_id,
          title: canonical.title,
          last_message_id: canonical.last_message_id,
          messages: canonical.messages,
        },
      };
    },
    'julia:conversation:commit-external': async (_event, input) => {
      return textClient.commitExternalTurns(input, getTextClientOptions());
    },
  };
}

function registerConversationIpcHandlers(ipcMain, deps) {
  const handlers = createConversationIpcHandlers(deps);
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
  return handlers;
}

module.exports = {
  createConversationIpcHandlers,
  registerConversationIpcHandlers,
};
