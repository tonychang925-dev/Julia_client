const defaultTextClient = require('./text-client');

function createConversationIpcHandlers({
  getConversationStore,
  getTextClientOptions,
  getUserDataPath,
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
        // AT-22: cached projection has no canonical authority — Core 404.
        // Remove the phantom locally and fall through to create canonical.
        console.warn('[AT22_ORPHAN_REMOVED]', cached.conversation_id, error.message);
        getConversationStore().removeConversation(cached.conversation_id);
      }
    }

    const items = await textClient.listConversationsViaCore(getTextClientOptions());
    const valid = items.filter((item) => !getConversationStore().isOrphanId(item.conversation_id));
    cacheCoreConversationSummaries(valid);
    if (valid.length > 0) {
      const first = valid[0];
      return syncCoreConversationProjection(first.conversation_id, first.title || 'New Conversation');
    }

    const canonical = await textClient.createConversationViaCore('New Conversation', getTextClientOptions());
    return getConversationStore().createConversationWithId(
      canonical.conversation_id,
      canonical.title || 'New Conversation'
    );
  }

  // AT-22: single entry point that guarantees a canonical current conversation.
  // Projection may be forgotten, but its identity is always minted by Core.
  async function ensureCurrentCoreConversation() {
    const current = await getCurrentCoreConversationProjection();
    if (current?.conversation_id && !getConversationStore().isOrphanId(current.conversation_id)) {
      return current;
    }
    const canonical = await textClient.createConversationViaCore('New Conversation', getTextClientOptions());
    return getConversationStore().createConversationWithId(
      canonical.conversation_id,
      canonical.title || 'New Conversation'
    );
  }

  // AT-22 startup/periodic reconciliation: detect projections with no
  // canonical authority, record evidence, and remove them.
  async function reconcileConversationProjections() {
    const store = getConversationStore();
    const storeConvs = store.listConversations();
    const items = await textClient.listConversationsViaCore(getTextClientOptions());
    const coreIds = new Set(items.map((item) => item.conversation_id));
    const orphans = storeConvs
      .filter((c) => !coreIds.has(c.conversation_id) || store.isOrphanId(c.conversation_id))
      .map((c) => c.conversation_id);

    if (orphans.length > 0) {
      const evidence = {
        orphan_conversations: orphans,
        reason: 'local projection without canonical authority',
        detected_at: new Date().toISOString(),
      };
      try {
        const fs = require('fs');
        const path = require('path');
        const baseDir = typeof getUserDataPath === 'function' ? getUserDataPath() : null;
        const evidencePath = baseDir
          ? path.join(baseDir, 'projection-reconciliation.json')
          : path.join(require('os').tmpdir(), 'julia-projection-reconciliation.json');
        fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
        console.warn('[AT22_RECONCILE_EVIDENCE]', evidencePath, orphans);
      } catch (err) {
        console.warn('[AT22_RECONCILE_EVIDENCE_WRITE_FAILED]', err.message);
      }
      for (const id of orphans) {
        store.removeConversation(id);
      }
    }
    return { reconciled: orphans.length, orphans };
  }

  return {
    'julia:conversation:list': async () => listCoreConversationProjection(),
    'julia:conversation:current': async () => ensureCurrentCoreConversation(),
    'julia:conversation:reconcile': async () => reconcileConversationProjections(),
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
      const conversationId = String(input?.conversationId || '').trim();
      const title = String(input?.title || '').trim();
      if (!conversationId) throw new Error('Conversation ID is required');
      if (!title) throw new Error('Title is required');
      // Core-first rename: canonical title changes in Brain, then projection.
      await textClient.renameConversationViaCore(conversationId, title, getTextClientOptions());
      return getConversationStore().renameConversation(conversationId, title);
    },
    'julia:conversation:delete': async (_event, input) => {
      const conversationId = String(input?.conversationId || '').trim();
      if (!conversationId) throw new Error('Conversation ID is required');
      // Canonical first: delete from Brain, then drop the local projection.
      // (Previously only the local store was removed, so the conversation
      // reappeared on the next canonical list refresh.)
      await textClient.deleteConversationViaCore(conversationId, getTextClientOptions());
      const storeResult = (() => {
        try {
          return getConversationStore().deleteConversation(conversationId);
        } catch (err) {
          if (/not found/i.test(err?.message || '')) {
            return { status: 'deleted', conversation_id: conversationId, local_projection: 'absent', current_conversation: null };
          }
          throw err;
        }
      })();
      // AT-22: deletion must never mint. If the deleted conversation was the
      // current one and the store is now empty, stay empty (current=null) —
      // the UI shows the empty state and the user starts a new conversation
      // via New Chat (Core create). Only defensive-clean a stray orphan id.
      const current = storeResult.current_conversation;
      if (!current) {
        return { ...storeResult, current_conversation: null, empty: true };
      }
      if (getConversationStore().isOrphanId(current.conversation_id)) {
        getConversationStore().removeConversation(current.conversation_id);
        return { ...storeResult, current_conversation: null, empty: true };
      }
      return storeResult;
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
