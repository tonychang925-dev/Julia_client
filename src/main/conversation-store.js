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
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
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
      .map((conversation) => ({
        conversation_id: conversation.conversation_id,
        title: conversation.title,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        message_count: conversation.messages.length,
      }));
  }

  createConversation(title = 'New Conversation') {
    this.load();
    const timestamp = nowIso();
    const conversation = {
      conversation_id: createId('conv'),
      title: deriveTitle(title),
      created_at: timestamp,
      updated_at: timestamp,
      messages: [],
    };
    this.state.conversations.unshift(conversation);
    this.state.currentConversationId = conversation.conversation_id;
    this.save();
    return conversation;
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
    if (conversation.title === 'New Conversation' && normalized.role === 'user') {
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
