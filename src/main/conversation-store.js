const fs = require('fs');
const path = require('path');

const STORE_VERSION = 1;
const DEFAULT_FILE_NAME = 'julia-conversations-v1.json';

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

function normalizeConversation(conversation) {
  return {
    conversation_id: conversation.conversation_id,
    title: conversation.title || 'New Conversation',
    title_updated_by_user: Boolean(conversation.title_updated_by_user),
    created_at: conversation.created_at || nowIso(),
    updated_at: conversation.updated_at || conversation.created_at || nowIso(),
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
    const parsed = JSON.parse(raw);
    this.state = {
      version: STORE_VERSION,
      currentConversationId: parsed.currentConversationId || null,
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations.map(normalizeConversation)
        : [],
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

  createConversation(title = 'New Conversation') {
    this.load();
    const timestamp = nowIso();
    const conversation = {
      conversation_id: createId('conv'),
      title: deriveTitle(title),
      title_updated_by_user: false,
      created_at: timestamp,
      updated_at: timestamp,
      messages: [],
    };
    this.state.conversations.unshift(conversation);
    this.state.currentConversationId = conversation.conversation_id;
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
    let currentConversation = null;

    if (this.state.currentConversationId === conversationId) {
      if (this.state.conversations.length > 0) {
        this.state.conversations.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
        currentConversation = this.state.conversations[0];
        this.state.currentConversationId = currentConversation.conversation_id;
      } else {
        this.state.currentConversationId = null;
        currentConversation = this.createConversation('New Conversation');
        return {
          deleted_conversation_id: deleted.conversation_id,
          current_conversation: currentConversation,
        };
      }
    } else if (this.state.currentConversationId) {
      currentConversation = this.getConversation(this.state.currentConversationId);
    }

    this.save();
    return {
      deleted_conversation_id: deleted.conversation_id,
      current_conversation: currentConversation,
    };
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
    this.load();
    if (this.state.currentConversationId) {
      const current = this.getConversation(this.state.currentConversationId);
      if (current) return current;
    }

    if (this.state.conversations.length > 0) {
      this.state.currentConversationId = this.state.conversations[0].conversation_id;
      this.save();
      return this.state.conversations[0];
    }

    return this.createConversation('New Conversation');
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

    conversation.messages.push(normalized);
    conversation.updated_at = timestamp;
    if (!conversation.title_updated_by_user && conversation.title === 'New Conversation' && normalized.role === 'user') {
      conversation.title = deriveTitle(normalized.content);
    }
    this.state.currentConversationId = conversation.conversation_id;
    this.save();
    return normalized;
  }
}

function createConversationStore(baseDir) {
  return new ConversationStore(baseDir);
}

module.exports = {
  ConversationStore,
  createConversationStore,
  deriveTitle,
};
