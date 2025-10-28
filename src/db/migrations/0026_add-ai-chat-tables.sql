-- Migration number: 0026 	 2025-10-27T16:30:00.000Z

-- Add AI Chat persistence tables (three-table architecture from AI SDK v5 docs)

CREATE TABLE ai_chats (
  id TEXT PRIMARY KEY NOT NULL,
  teamId TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT(255),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updateCounter INTEGER DEFAULT 0
);

CREATE INDEX ai_chats_team_idx ON ai_chats(teamId);
CREATE INDEX ai_chats_user_idx ON ai_chats(userId);
CREATE INDEX ai_chats_created_idx ON ai_chats(createdAt);

CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY NOT NULL,
  chatId TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  role TEXT(20) NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updateCounter INTEGER DEFAULT 0
);

CREATE INDEX ai_messages_chat_idx ON ai_messages(chatId);
CREATE INDEX ai_messages_created_idx ON ai_messages(createdAt);

CREATE TABLE ai_message_parts (
  id TEXT PRIMARY KEY NOT NULL,
  messageId TEXT NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  partOrder INTEGER NOT NULL,
  text_content TEXT,
  tool_name TEXT(100),
  tool_call_id TEXT(100),
  tool_args TEXT,
  tool_result TEXT,
  tool_state TEXT(50),
  image_url TEXT,
  image_mime_type TEXT(50),
  file_url TEXT,
  file_name TEXT(255),
  file_type TEXT(100),
  file_metadata TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updateCounter INTEGER DEFAULT 0
);

CREATE INDEX ai_message_parts_message_idx ON ai_message_parts(messageId);
CREATE INDEX ai_message_parts_order_idx ON ai_message_parts(messageId, partOrder);
