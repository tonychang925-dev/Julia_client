const fs = require('fs');
const path = require('path');

const STORE_VERSION = 2;
const DEFAULT_FILE_NAME = 'julia-conversations-v1.json';

// UI cache only. Julia Core ConversationRuntime is the sole authority for
// cognitive history and conversation continuity. Nothing in this file is sent
// to Julia as prompt/history/context.

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

function deriveTitle(text) {
  const title = String(text || '').replace(/\s+/g, ' ').trim();
  if (!title) return 'New Conversation';
  return title.length > 48 ? `${title.slice(0, 48)}…` : title;
}

function normalizeProjectionMetadata(metadata = {}) {
  return {
    source: metadata.source || 'julia-electron-projection-cache',
    authority: 'disposable_projection',
    last_reconciled_at: metadata.last_reconciled_at || null,
    last_reconcile_error: metadata.last_reconcile_error || null,
    stale: Boolean(metadata.stale),
  };
}

function normalizeConversation(conversation) {
  return {
    conversation_id: conversation.conversation_id,
    title: conversation.title || 'New Conversation',
    title_updated_by_user: Boolean(conversation.title_updated_by_user),
    created_at: conversation.created_at || nowIso(),
    updated_at: conversation.updated_at || conversation.created_at || nowIso(),
    projection: normalizeProjectionMetadata(conversation.projection),
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
  };
}

function summarizeConversation(conversation, extra = {}) {
  const normalized = normalizeConversation(conversation);
  return {
    conversation_id: normalized.conversation_id,
    title: normalized.title,
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
    message_count: normalized.messages.length,
    projection: normalized.projection,
    ...extra,
  };
}

class ConversationStore {
  constructor(baseDir, fileName = DEFAULT_FILE_NAME) {
    this.baseDir = baseDir;
    this.filePath = path.join(baseDir, fileName);
    this.state = {
      version: STORE_VERSION,
      currentConversationId: null,
      conversations: [],
      cache: {
        kind: 'disposable_projection',
        authority: 'non_canonical',
        last_cleared_at: null,
      },
    };
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this.state;
    fs.mkdirSync(this.baseDir, { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      this.loaded = true;
      this.save();
      return this.state;
    }

    const raw = fs.readFileSync(this.filePath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const corruptPath = `${this.filePath}.corrupt-${Date.now()}`;
      fs.renameSync(this.filePath, corruptPath);
      this.state.cache = {
        kind: 'disposable_projection',
        authority: 'non_canonical',
        last_cleared_at: nowIso(),
        recovered_from_corruption: path.basename(corruptPath),
      };
      this.loaded = true;
      this.save();
      return this.state;
    }
    this.state = {
      version: STORE_VERSION,
      currentConversationId: parsed.currentConversationId || null,
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations.map(normalizeConversation)
        : [],
      cache: {
        kind: 'disposable_projection',
        authority: 'non_canonical',
        last_cleared_at: parsed.cache?.last_cleared_at || null,
        recovered_from_corruption: parsed.cache?.recovered_from_corruption || null,
      },
    };
    this.loaded = true;
    return this.state;
  }

  save() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  listConversations() {
    this.load();
    return [...this.state.conversations]
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .map((conversation) => summarizeConversation(conversation));
  }

  createConversation(title = 'New Conversation', canonicalId) {
    // CM-S5-R1A: Electron MUST NOT fabricate a local canonical conversation_id.
    // Canonical id must come from Core/Brain. Missing → fail closed.
    if (!canonicalId) {
      throw new Error('Canonical conversation_id is required; Electron must not fabricate a local id');
    }
    return this.createConversationWithId(canonicalId, title);
  }

  createConversationWithId(conversationId, title = 'New Conversation') {
    // CM-S5-R1A: projection store invariant — canonical id must be non-empty.
    const id = String(conversationId || '').trim();
    if (!id) {
      throw new Error('Canonical conversation_id is required');
    }
    this.load();
    const existing = this.getConversation(id);
    if (existing) {
      this.state.currentConversationId = id;
      this.save();
      return existing;
    }
    const timestamp = nowIso();
    const conversation = {
      conversation_id: id,
      title: deriveTitle(title),
      title_updated_by_user: false,
      created_at: timestamp,
      updated_at: timestamp,
      projection: normalizeProjectionMetadata(),
      messages: [],
    };
    this.state.conversations.unshift(conversation);
    this.state.currentConversationId = id;
    this.save();
    return conversation;
  }

  projectConversation(conversationId, title = 'New Conversation') {
    // CM-S5-R1B: project a canonical conversation WITHOUT changing the
    // current selection (used by list).
    const id = String(conversationId || '').trim();
    if (!id) throw new Error('Canonical conversation_id is required');
    this.load();
    const existing = this.getConversation(id);
    if (existing) return existing;
    const timestamp = nowIso();
    const conversation = {
      conversation_id: id,
      title: deriveTitle(title),
      title_updated_by_user: false,
      created_at: timestamp,
      updated_at: timestamp,
      projection: normalizeProjectionMetadata(),
      messages: [],
    };
    this.state.conversations.unshift(conversation);
    this.save();
    return conversation;
  }

  renameConversation(conversationId, title) {
    this.load();
    const conversation = this.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const nextTitle = deriveTitle(title);
    conversation.title = nextTitle;
    conversation.title_updated_by_user = true;
    conversation.updated_at = nowIso();
    this.save();
    return conversation;
  }

  deleteConversation(conversationId) {
    this.load();
    const index = this.state.conversations.findIndex((item) => item.conversation_id === conversationId);
    if (index < 0) throw new Error(`Conversation not found: ${conversationId}`);

    const [deleted] = this.state.conversations.splice(index, 1);
    if (this.state.currentConversationId === conversationId) {
      // CM-S5-R1A: deleting the last projection leaves empty state — never
      // auto-create a replacement (which would fabricate a local id).
      this.state.currentConversationId = this.state.conversations[0]?.conversation_id || null;
    }

    this.save();
    return {
      deleted_conversation_id: deleted.conversation_id,
      current_conversation: this.state.currentConversationId
        ? this.getConversation(this.state.currentConversationId)
        : null,
    };
  }

  getCacheStatus() {
    this.load();
    const messageCount = this.state.conversations.reduce((total, conversation) => (
      total + (Array.isArray(conversation.messages) ? conversation.messages.length : 0)
    ), 0);
    const staleCount = this.state.conversations.filter((conversation) => conversation.projection?.stale).length;
    return {
      kind: 'disposable_projection',
      authority: 'non_canonical',
      file_path: this.filePath,
      conversation_count: this.state.conversations.length,
      message_count: messageCount,
      stale_conversation_count: staleCount,
      current_conversation_id: this.state.currentConversationId,
      last_cleared_at: this.state.cache?.last_cleared_at || null,
      recovered_from_corruption: this.state.cache?.recovered_from_corruption || null,
    };
  }

  clearLocalCache() {
    this.load();
    const previous = this.getCacheStatus();
    this.state.conversations = [];
    this.state.currentConversationId = null;
    this.state.cache = {
      kind: 'disposable_projection',
      authority: 'non_canonical',
      last_cleared_at: nowIso(),
    };
    this.save();
    return {
      cleared: true,
      previous,
      cache: this.getCacheStatus(),
    };
  }

  markConversationStale(conversationId, error) {
    this.load();
    const conversation = this.getConversation(conversationId);
    if (!conversation) return null;
    conversation.projection = normalizeProjectionMetadata({
      ...conversation.projection,
      stale: true,
      last_reconcile_error: error ? String(error) : null,
    });
    this.save();
    return conversation;
  }

  searchConversations(query) {
    this.load();
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return this.listConversations();

    return [...this.state.conversations]
      .map((conversation) => {
        const title = conversation.title || '';
        const titleMatch = title.toLowerCase().includes(needle);
        const matchedMessages = conversation.messages
          .filter((message) => String(message.content || '').toLowerCase().includes(needle));
        if (!titleMatch && matchedMessages.length === 0) return null;

        const firstMessageMatch = matchedMessages[0]?.content || '';
        const snippet = titleMatch ? title : deriveTitle(firstMessageMatch);
        return summarizeConversation(conversation, {
          match_count: (titleMatch ? 1 : 0) + matchedMessages.length,
          match_snippet: snippet,
        });
      })
      .filter(Boolean)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  getConversation(conversationId) {
    this.load();
    return this.state.conversations.find((item) => item.conversation_id === conversationId) || null;
  }

  getCurrentConversation() {
    // CM-S5-R1A: pure getter. Empty → null. MUST NOT mutate the store.
    this.load();
    if (this.state.currentConversationId) {
      return this.getConversation(this.state.currentConversationId) || null;
    }
    return null;
  }

  setCurrentConversation(conversationId) {
    this.load();
    const conversation = this.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);
    this.state.currentConversationId = conversationId;
    this.save();
    return conversation;
  }

  addMessage(conversationId, message) {
    this.load();
    const conversation = this.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const timestamp = nowIso();
    const normalized = {
      message_id: message.message_id || createId('msg'),
      conversation_id: conversation.conversation_id,
      turn_id: message.turn_id || createId('turn'),
      role: message.role,
      modality: message.modality || 'text',
      content: String(message.content || ''),
      status: message.status || 'completed',
      created_at: message.created_at || timestamp,
      metadata: message.metadata || {},
    };

    if (!['user', 'assistant'].includes(normalized.role)) {
      throw new Error(`Invalid message role: ${normalized.role}`);
    }
    if (!normalized.content.trim()) {
      throw new Error('Message content is empty');
    }

    const existing = conversation.messages.find((item) => (
      item.turn_id === normalized.turn_id && item.role === normalized.role
    ));
    if (existing) {
      Object.assign(existing, normalized, { message_id: existing.message_id });
      conversation.updated_at = timestamp;
      this.state.currentConversationId = conversation.conversation_id;
      this.save();
      return existing;
    }

    conversation.messages.push(normalized);
    conversation.updated_at = timestamp;
    if (!conversation.title_updated_by_user && conversation.title === 'New Conversation' && normalized.role === 'user') {
      conversation.title = deriveTitle(normalized.content);
    }
    this.state.currentConversationId = conversation.conversation_id;
    this.save();
    return normalized;
  }

  reconcileCanonicalMessages(conversationId, canonical = {}) {
    this.load();
    let conversation = this.getConversation(conversationId);
    if (!conversation) {
      const timestamp = nowIso();
      conversation = {
        conversation_id: conversationId,
        title: canonical.title || 'New Conversation',
        title_updated_by_user: false,
        created_at: timestamp,
        updated_at: timestamp,
        projection: normalizeProjectionMetadata(),
        messages: [],
      };
      this.state.conversations.unshift(conversation);
    }

    let inserted = 0;
    let updated = 0;
    let removedLocal = 0;
    const canonicalMessages = Array.isArray(canonical.messages) ? canonical.messages : [];

    conversation.projection = normalizeProjectionMetadata({
      ...conversation.projection,
      stale: false,
      last_reconciled_at: nowIso(),
      last_reconcile_error: null,
    });

    for (const message of canonicalMessages) {
      const canonicalStatus = String(message?.status || '');
      const acceptedStatus = canonicalStatus === 'completed'
        || (message?.role === 'assistant' && canonicalStatus === 'interrupted');
      if (
        !message
        || !acceptedStatus
        || !['user', 'assistant'].includes(message.role)
        || !String(message.message_id || '').trim()
        || (message.turn_id && !String(message.turn_id || '').trim())
        || !String(message.content || '').trim()
      ) continue;

      const normalized = {
        message_id: String(message.message_id),
        conversation_id: conversationId,
        turn_id: String(message.turn_id),
        role: message.role,
        modality: message.modality === 'voice' ? 'voice' : 'text',
        content: String(message.content),
        status: canonicalStatus,
        created_at: message.created_at || nowIso(),
        metadata: { source: 'julia-core-canonical' },
      };

      const index = conversation.messages.findIndex((item) => (
        item.message_id === normalized.message_id
        || (item.turn_id === normalized.turn_id && item.role === normalized.role)
      ));
      if (index >= 0) {
        conversation.messages[index] = normalized;
        updated += 1;
      } else {
        conversation.messages.push(normalized);
        inserted += 1;
      }
    }

    conversation.messages = conversation.messages.filter((message) => {
      const isUnconfirmedLocal = message.metadata?.source === 'julia-electron-local'
        && ['pending', 'failed'].includes(message.status);
      if (!isUnconfirmedLocal) return true;
      removedLocal += 1;
      return false;
    });

    conversation.messages.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (canonical.title && canonical.title !== 'New Conversation') {
      conversation.title = canonical.title;
    }
    conversation.updated_at = conversation.messages.at(-1)?.created_at || conversation.updated_at || nowIso();
    this.state.currentConversationId = conversationId;
    this.save();

    return {
      conversation,
      reconciliation: {
        canonical_count: canonicalMessages.length,
        inserted,
        updated,
        removed_local: removedLocal,
      },
    };
  }
}

function createConversationStore(baseDir) {
  return new ConversationStore(baseDir);
}

module.exports = {
  ConversationStore,
  createConversationStore,
  deriveTitle,
  normalizeProjectionMetadata,
};
