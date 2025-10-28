# Persisting Chat Messages in Postgres with AI SDK v5

**Note**: The specific AI Hero lesson page at aihero.dev was inaccessible. This guide is compiled from official Vercel AI SDK v5 documentation and the vercel-labs/ai-sdk-persistence-db reference implementation, covering the same implementation patterns and best practices.

## Why persistence matters for production chat applications

**Persistence transforms your chatbot from a stateless conversation tool into a production-ready application** where users can return to previous conversations, recover from disconnects, and maintain context across sessions. The AI SDK v5 introduces UIMessage format specifically designed for this purpose, making message persistence type-safe and reliable across your stack.

The challenge: AI SDK v5 uses different message formats for different purposes. **UIMessages** contain the complete conversation state with IDs, timestamps, and structured parts arrays—perfect for persistence. **ModelMessages** are streamlined for LLM communication. Understanding this distinction and implementing proper conversion is crucial for reliable persistence.

## Setup: Database and environment configuration

### Prerequisites and dependencies

```json
{
  "dependencies": {
    "ai": "^5.0.0",
    "@ai-sdk/openai": "latest",
    "@ai-sdk/react": "latest",
    "drizzle-orm": "latest",
    "postgres": "latest",
    "next": "latest",
    "react": "latest"
  }
}
```

### Database initialization

Create your Postgres database:

```bash
# Using createdb
createdb ai-sdk-demo

# Or use PgAdmin, Vercel Postgres, Neon, or other Postgres providers
```

### Environment configuration

Create `.env.local` with your credentials:

```bash
DATABASE_URL=postgres://username:password@localhost:5432/ai-sdk-demo
OPENAI_API_KEY=your_openai_api_key_here
```

For Vercel Postgres or other hosted solutions, you may receive additional connection strings:

```bash
POSTGRES_URL="postgres://..."
POSTGRES_PRISMA_URL="..."
POSTGRES_URL_NO_SSL="..."
POSTGRES_URL_NON_POOLING="..."
```

## Database schema: The prefix-based approach

### Why prefix-based columns matter

**The prefix-based approach avoids complex polymorphic relationships while maintaining type safety and query performance.** Instead of storing message parts as JSONB (which loses type safety and makes querying difficult), each part type gets dedicated columns with specific prefixes. This enables atomic operations, proper indexing, and reliable type conversion.

### Three-table architecture

The schema uses three interconnected tables:

**1. chats table** - Stores chat sessions with auto-generated IDs:

```typescript
// lib/db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const chats = pgTable('chats', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  title: text('title'),
  userId: text('user_id'), // Add user auth later
});
```

**2. messages table** - Individual messages with role and chat reference:

```typescript
export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  chatId: serial('chat_id')
    .notNull()
    .references(() => chats.id),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**3. parts table** - Message content with prefix-based columns:

```typescript
export const parts = pgTable('parts', {
  id: serial('id').primaryKey(),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id),
  partOrder: integer('part_order').notNull(),

  // Text content parts
  text_content: text('text_content'),

  // Reasoning/thinking parts
  reasoning_content: text('reasoning_content'),
  reasoning_metadata: jsonb('reasoning_metadata'),

  // File attachments
  file_url: text('file_url'),
  file_name: text('file_name'),
  file_type: text('file_type'),
  file_metadata: jsonb('file_metadata'),

  // URL sources
  source_url_url: text('source_url_url'),
  source_url_description: text('source_url_description'),

  // Document sources
  source_document_id: text('source_document_id'),
  source_document_metadata: jsonb('source_document_metadata'),

  // Tool calls - dynamic columns per tool
  // Example: tool_getWeatherInformation_input, tool_getWeatherInformation_output
  // These are added dynamically based on your tools
});
```

### Schema constraints for data integrity

The schema enforces data integrity through carefully designed constraints:

- **Complete Part Definitions**: Each message part type requires all relevant columns populated together. Source URL parts must have both `source_url_url` AND `source_url_description` defined.
- **Tool Call Consistency**: Tool-related columns for the same tool must be provided as a complete set (input, output, state, provider metadata).

These constraints prevent partial or corrupted message parts from storage, ensuring reliable message reconstruction.

### Migration and deployment

Create Drizzle configuration file `drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env.local' });

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Push schema to database:

```bash
# Install dependencies
pnpm install

# Push database schema (development)
pnpm drizzle-kit push

# Or generate and run migrations (production)
pnpm drizzle-kit generate
pnpm tsx migrate.ts
```

## Message format conversions: UIMessage ↔ Database

### Understanding the two message formats

**UIMessage** - The complete conversation state:
- Contains `id`, `createdAt`, and structured `parts[]` array
- Includes metadata, tool results, and custom data parts
- **This is what you persist to the database**
- This is what `useChat` manages in React state

**ModelMessage** - Streamlined for LLM communication:
- Simplified structure optimized for language models
- Contains only what the LLM needs to process
- **Convert UIMessage → ModelMessage before sending to LLM**

### Conversion pattern in practice

```typescript
import { convertToModelMessages } from 'ai';

// Load UIMessages from database
const uiMessages = await loadChat(chatId);

// Convert to ModelMessages for LLM
const modelMessages = convertToModelMessages(uiMessages);

// Send to LLM
const result = streamText({
  model: openai('gpt-4o-mini'),
  messages: modelMessages, // Use converted ModelMessages
});

// Save UIMessages back to database (in onFinish callback)
return result.toUIMessageStreamResponse({
  originalMessages: uiMessages,
  onFinish: ({ messages }) => {
    saveChat({ chatId, messages }); // Save UIMessages
  },
});
```

### Bidirectional message mapping utilities

Create `lib/utils/message-mapping.ts` for converting between UIMessages and database rows:

**UIMessage → Database (flattening)**:
- Message parts are flattened into database rows
- Each part gets an order index to maintain sequence
- Tool states and provider metadata are preserved in JSONB columns

**Database → UIMessage (reconstruction)**:
- Database rows are reconstructed into typed message parts
- Tool states and custom data properly restored
- Type safety maintained throughout using TypeScript

```typescript
// lib/utils/message-mapping.ts
import { UIMessage, UIMessagePart } from 'ai';

export function uiMessageToDbRows(message: UIMessage) {
  return message.parts.map((part, index) => ({
    messageId: message.id,
    partOrder: index,
    // Map part type to appropriate prefix columns
    ...(part.type === 'text' && { text_content: part.text }),
    ...(part.type === 'tool-call' && {
      [`tool_${part.toolName}_input`]: JSON.stringify(part.args),
      [`tool_${part.toolName}_state`]: 'input-available',
    }),
    // Add other part type mappings
  }));
}

export function dbRowsToUIMessage(rows: any[]): UIMessage {
  // Group rows by messageId and reconstruct parts array
  const parts: UIMessagePart[] = rows
    .sort((a, b) => a.partOrder - b.partOrder)
    .map(row => {
      // Detect part type from prefix columns and reconstruct
      if (row.text_content) {
        return { type: 'text', text: row.text_content };
      }
      // Add other part type reconstructions
    });

  return {
    id: rows[0].messageId,
    role: rows[0].role,
    parts,
    createdAt: rows[0].createdAt,
  };
}
```

## Database operations: CRUD with atomic transactions

### Core database actions

Create `lib/db/actions.ts` to handle all database operations:

```typescript
// lib/db/actions.ts
import { db } from './client';
import { chats, messages, parts } from './schema';
import { eq, and } from 'drizzle-orm';
import { UIMessage } from 'ai';
import { uiMessageToDbRows, dbRowsToUIMessage } from '@/lib/utils/message-mapping';

export async function createChat(): Promise<number> {
  const [chat] = await db.insert(chats)
    .values({ createdAt: new Date() })
    .returning({ id: chats.id });

  return chat.id;
}

export async function upsertMessage(message: UIMessage, chatId: number) {
  // Use transaction for atomic operation
  await db.transaction(async (tx) => {
    // Insert or update message
    await tx.insert(messages)
      .values({
        id: message.id,
        chatId,
        role: message.role,
        createdAt: message.createdAt || new Date(),
      })
      .onConflictDoUpdate({
        target: messages.id,
        set: { role: message.role },
      });

    // Delete existing parts for this message
    await tx.delete(parts)
      .where(eq(parts.messageId, message.id));

    // Insert new parts
    const partRows = uiMessageToDbRows(message);
    if (partRows.length > 0) {
      await tx.insert(parts).values(partRows);
    }
  });
}

export async function loadChat(chatId: number): Promise<UIMessage[]> {
  // Join messages and parts, order by creation time
  const rows = await db
    .select()
    .from(messages)
    .leftJoin(parts, eq(messages.id, parts.messageId))
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.createdAt, parts.partOrder);

  // Group by message and reconstruct UIMessages
  return dbRowsToUIMessage(rows);
}

export async function getChats(userId?: string): Promise<Chat[]> {
  const query = userId
    ? db.select().from(chats).where(eq(chats.userId, userId))
    : db.select().from(chats);

  return await query.orderBy(chats.createdAt);
}

export async function deleteChat(chatId: number) {
  // Cascade delete will handle messages and parts if configured
  await db.delete(chats).where(eq(chats.id, chatId));
}

export async function deleteMessage(messageId: string) {
  await db.delete(messages).where(eq(messages.id, messageId));
}
```

### Database client setup

Create `lib/db/client.ts`:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client);
```

## API route implementation: Streaming with persistence

### Basic chat API with message saving

Create `app/api/chat/route.ts`:

```typescript
import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, UIMessage } from 'ai';
import { loadChat, upsertMessage } from '@/lib/db/actions';

export async function POST(req: Request) {
  const { messages, chatId }: { messages: UIMessage[]; chatId: number } =
    await req.json();

  // Convert UIMessages to ModelMessages for LLM
  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: convertToModelMessages(messages),
  });

  // Stream response and save on completion
  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages }) => {
      // Save all messages atomically
      for (const message of messages) {
        await upsertMessage(message, chatId);
      }
    },
  });
}
```

### Advanced: Sending only the last message

**This optimization reduces bandwidth by sending only the new user message**, loading previous context server-side:

**Client-side transport configuration**:

```typescript
// components/chat.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function Chat({ id, initialMessages }) {
  const { sendMessage, messages } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest({ messages, id }) {
        // Only send the last message
        return {
          body: {
            message: messages[messages.length - 1],
            id,
          },
        };
      },
    }),
  });

  // Rest of component...
}
```

**Server-side message loading and validation**:

```typescript
// app/api/chat/route.ts
import {
  convertToModelMessages,
  streamText,
  UIMessage,
  validateUIMessages
} from 'ai';
import { loadChat, upsertMessage } from '@/lib/db/actions';

export async function POST(req: Request) {
  // Get only the last message from client
  const { message, id } = await req.json();

  // Load previous messages from database
  const previousMessages = await loadChat(id);

  // Append new message to history
  const allMessages = [...previousMessages, message];

  // Validate messages if using tools, metadata, or custom data parts
  const validatedMessages = await validateUIMessages({
    messages: allMessages,
    tools, // If using tools
    metadataSchema, // If using custom metadata
    dataSchemas, // If using custom data parts
  });

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: convertToModelMessages(validatedMessages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: validatedMessages,
    onFinish: async ({ messages }) => {
      // Save the new assistant message
      const newMessage = messages[messages.length - 1];
      await upsertMessage(newMessage, id);
    },
  });
}
```

### Validation with tools and custom schemas

When your messages include tool calls, **always validate them against current tool definitions** to prevent runtime errors from schema changes:

```typescript
import {
  convertToModelMessages,
  streamText,
  validateUIMessages,
  tool,
  TypeValidationError
} from 'ai';
import { z } from 'zod';

// Define your tools
const tools = {
  getWeather: tool({
    description: 'Get weather for a location',
    parameters: z.object({
      location: z.string(),
      units: z.enum(['celsius', 'fahrenheit']),
    }),
    execute: async ({ location, units }) => {
      // Implementation
      return { temperature: 72, conditions: 'sunny' };
    },
  }),
};

export async function POST(req: Request) {
  const { message, id } = await req.json();
  const previousMessages = await loadChat(id);

  let validatedMessages: UIMessage[];

  try {
    validatedMessages = await validateUIMessages({
      messages: [...previousMessages, message],
      tools, // Ensures tool calls match current schemas
      metadataSchema,
      dataSchemas,
    });
  } catch (error) {
    if (error instanceof TypeValidationError) {
      // Log for monitoring
      console.error('Message validation failed:', error);

      // Option 1: Start fresh without history
      validatedMessages = [message];

      // Option 2: Filter out invalid messages
      // validatedMessages = await filterValidMessages(previousMessages, tools);
    } else {
      throw error;
    }
  }

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: convertToModelMessages(validatedMessages),
    tools,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: validatedMessages,
    onFinish: async ({ messages }) => {
      for (const msg of messages) {
        await upsertMessage(msg, id);
      }
    },
  });
}
```

### Handling client disconnects with consumeStream

**By default, AI SDK uses backpressure** - if the client disconnects, the LLM stream aborts and messages aren't saved. Use `consumeStream()` to continue processing server-side:

```typescript
export async function POST(req: Request) {
  const { messages, chatId } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: convertToModelMessages(messages),
  });

  // Consume stream to ensure completion even if client disconnects
  result.consumeStream(); // No await - runs in background

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages }) => {
      // This will execute even after client disconnect
      for (const message of messages) {
        await upsertMessage(message, chatId);
      }
    },
  });
}
```

When the client reloads after disconnect, **the chat is restored from database storage**. For production, track message state (in-progress, complete) and implement resumability for partial responses.

## Frontend integration with useChat hook

### Creating a new chat session

Create a server component for chat initialization:

```typescript
// app/page.tsx
import { redirect } from 'next/navigation';
import { createChat } from '@/lib/db/actions';

export default async function HomePage() {
  const id = await createChat(); // Creates chat, returns ID
  redirect(`/chat/${id}`); // Redirect to chat page
}
```

### Loading existing chat

Create a server component that loads messages:

```typescript
// app/chat/[id]/page.tsx
import { loadChat } from '@/lib/db/actions';
import Chat from '@/components/chat';

export default async function ChatPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const chatId = parseInt(id);
  const messages = await loadChat(chatId);

  return <Chat id={chatId} initialMessages={messages} />;
}
```

### Client chat component with useChat

Create the interactive chat interface:

```typescript
// components/chat.tsx
'use client';

import { UIMessage, useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

interface ChatProps {
  id: number;
  initialMessages?: UIMessage[];
}

export default function Chat({ id, initialMessages }: ChatProps) {
  const [input, setInput] = useState('');

  const { sendMessage, messages, isLoading } = useChat({
    id: id.toString(), // useChat expects string ID
    messages: initialMessages, // Load initial messages from server
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      {/* Messages display */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`rounded-lg px-4 py-2 max-w-[80%] ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-black'
              }`}
            >
              {/* Render text parts */}
              {message.parts
                .filter(part => part.type === 'text')
                .map((part, i) => (
                  <p key={i}>{part.text}</p>
                ))}

              {/* Render tool calls */}
              {message.parts
                .filter(part => part.type === 'tool-call')
                .map((part, i) => (
                  <div key={i} className="text-sm opacity-75">
                    Calling {part.toolName}...
                  </div>
                ))}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-lg px-4 py-2">
              <div className="animate-pulse">Thinking...</div>
            </div>
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex space-x-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

## Message ID generation: Server-side vs client-side

### Why server-side IDs matter for persistence

**Client-side ID generation creates conflicts** when messages are stored and retrieved across sessions. Server-side IDs ensure consistency and prevent race conditions.

By default:
- User message IDs are generated by `useChat` on the client
- AI response message IDs are generated by `streamText` on the server

**For persistence, generate all message IDs server-side.**

### Option 1: Using generateMessageId in toUIMessageStreamResponse

```typescript
import { createIdGenerator, streamText } from 'ai';

export async function POST(req: Request) {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Generate consistent server-side IDs
    generateMessageId: createIdGenerator({
      prefix: 'msg',
      size: 16,
    }),
    onFinish: ({ messages }) => {
      // All messages now have server-generated IDs
      saveMessages(chatId, messages);
    },
  });
}
```

### Option 2: Manual ID control with createUIMessageStream

```typescript
import {
  generateId,
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';

export async function POST(req: Request) {
  const { messages, chatId } = await req.json();

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      // Write start message part with custom ID
      writer.write({
        type: 'start',
        messageId: generateId(), // Server-generated ID
      });

      const result = streamText({
        model: openai('gpt-4o-mini'),
        messages: convertToModelMessages(messages),
      });

      writer.merge(result.toUIMessageStream({
        sendStart: false, // Omit default start message
      }));
    },
    originalMessages: messages,
    onFinish: ({ responseMessage }) => {
      upsertMessage(responseMessage, chatId);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

### Custom client-side ID generation (optional)

For non-persistent applications, customize client IDs:

```typescript
import { createIdGenerator } from 'ai';
import { useChat } from '@ai-sdk/react';

const { ... } = useChat({
  generateId: createIdGenerator({
    prefix: 'msgc', // Client prefix
    size: 16,
  }),
});
```

## Production best practices and common pitfalls

### Critical production considerations

**1. Always use server-side ID generation for persistence**

Prevents ID conflicts and ensures consistency across sessions. Generate IDs in your API route, not in the client.

**2. Validate messages loaded from database**

Tool schemas and data formats change over time. Always validate with `validateUIMessages` before processing:

```typescript
const validatedMessages = await validateUIMessages({
  messages: loadedMessages,
  tools,
  metadataSchema,
  dataSchemas,
});
```

**3. Implement proper authorization**

```typescript
// app/api/chat/route.ts
import { getServerSession } from 'next-auth';

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { chatId } = await req.json();

  // Verify user owns this chat
  const chat = await getChat(chatId);
  if (chat.userId !== session.user.id) {
    return new Response('Forbidden', { status: 403 });
  }

  // Continue with message processing...
}
```

**4. Use consumeStream for disconnect resilience**

Ensures messages are saved even when clients disconnect mid-stream.

**5. Implement comprehensive error logging**

```typescript
try {
  const validatedMessages = await validateUIMessages({...});
} catch (error) {
  if (error instanceof TypeValidationError) {
    // Log to monitoring service (e.g., Sentry)
    console.error('Validation error', {
      chatId,
      error: error.message,
      failedMessages: error.value
    });
  }
}
```

### Common mistakes to avoid

**❌ Don't store messages as JSONB**

```typescript
// BAD: Loses type safety and query performance
await db.insert(messages).values({
  chatId,
  content: JSON.stringify(message), // Don't do this
});
```

Use the prefix-based approach instead for type safety and efficient queries.

**❌ Don't trust client-generated IDs for persistence**

```typescript
// BAD: Client IDs can conflict
const { messages } = await req.json();
await saveMessages(messages); // Uses client IDs
```

Generate IDs server-side to prevent conflicts.

**❌ Don't skip message validation**

```typescript
// BAD: May cause runtime errors
const messages = await loadChat(chatId);
const result = streamText({
  messages: convertToModelMessages(messages), // Not validated
  tools,
});
```

Always validate with `validateUIMessages` when loading from database.

**❌ Don't send full history on every request after implementing persistence**

```typescript
// INEFFICIENT: Sends all messages every time
transport: new DefaultChatTransport({
  api: '/api/chat',
  // No prepareSendMessagesRequest - sends everything
})
```

Use `prepareSendMessagesRequest` to send only the last message.

**❌ Don't ignore tool execution states**

Tool calls have multiple states: `input-streaming`, `input-available`, `output-available`, `output-error`. Store and handle these properly in your parts table.

### Performance optimization tips

**1. Add database indexes**

```sql
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_parts_message_id ON parts(message_id);
CREATE INDEX idx_parts_order ON parts(message_id, part_order);
```

**2. Implement connection pooling**

```typescript
// lib/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!, {
  max: 10, // Connection pool size
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client);
```

**3. Use pagination for long chat histories**

```typescript
export async function loadChatMessages(
  chatId: number,
  limit = 50,
  offset = 0
) {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.createdAt)
    .limit(limit)
    .offset(offset);
}
```

**4. Implement caching for frequently accessed chats**

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

export async function loadChatWithCache(chatId: number) {
  const cacheKey = `chat:${chatId}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Load from database
  const messages = await loadChat(chatId);

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(messages));

  return messages;
}
```

**5. Use atomic transactions**

Always wrap related database operations in transactions:

```typescript
await db.transaction(async (tx) => {
  await tx.insert(messages).values(messageData);
  await tx.insert(parts).values(partsData);
  // Both succeed or both fail
});
```

## Complete implementation workflow

### Step-by-step implementation guide

**Step 1: Initialize project and install dependencies**

```bash
npx create-next-app@latest ai-chat-app --typescript
cd ai-chat-app
pnpm add ai @ai-sdk/openai @ai-sdk/react drizzle-orm postgres
pnpm add -D drizzle-kit
```

**Step 2: Set up database and environment**

```bash
# Create database
createdb ai-sdk-demo

# Create .env.local
echo "DATABASE_URL=postgres://localhost:5432/ai-sdk-demo" > .env.local
echo "OPENAI_API_KEY=your_key_here" >> .env.local
```

**Step 3: Define schema**

Create `lib/db/schema.ts` with the three-table structure (chats, messages, parts).

**Step 4: Configure Drizzle**

Create `drizzle.config.ts` with schema and database credentials.

**Step 5: Push schema to database**

```bash
pnpm drizzle-kit push
```

**Step 6: Create database client**

Create `lib/db/client.ts` with Postgres connection.

**Step 7: Implement message mapping**

Create `lib/utils/message-mapping.ts` with bidirectional conversion functions.

**Step 8: Create database actions**

Create `lib/db/actions.ts` with createChat, loadChat, upsertMessage, etc.

**Step 9: Build API route**

Create `app/api/chat/route.ts` with streaming and persistence.

**Step 10: Create chat pages**

- `app/page.tsx` - Creates new chat and redirects
- `app/chat/[id]/page.tsx` - Loads chat from database

**Step 11: Build chat component**

Create `components/chat.tsx` with useChat integration.

**Step 12: Test and deploy**

```bash
pnpm dev
# Open http://localhost:3000
# Test creating chats, sending messages, refreshing page
```

## Conclusion: Building production-ready chat applications

**This comprehensive implementation provides a solid foundation for production chat applications** with reliable message persistence, type safety throughout the stack, and optimized performance. The prefix-based schema design avoids common pitfalls while maintaining query performance and data integrity.

Key takeaways for successful implementation: persist UIMessages (not ModelMessages), validate loaded messages before processing, generate IDs server-side, use atomic transactions for data consistency, implement proper authorization, and optimize with indexes and caching. The AI SDK v5 makes these patterns straightforward with its unified message format and built-in utilities like `validateUIMessages` and `convertToModelMessages`.

By following this guide, you can build chat applications that handle disconnects gracefully, support multiple users with proper isolation, scale efficiently with connection pooling and indexes, and maintain data integrity through validation and transactions. The architecture is flexible enough to extend with features like message editing, branching conversations, or multi-modal content while keeping your codebase maintainable and type-safe.