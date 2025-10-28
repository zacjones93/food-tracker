# AI SDK v5 Crash Course Reference

The AI SDK v5 is a TypeScript library that makes building production-ready AI applications straightforward and type-safe. **It provides a unified API for seamlessly switching between OpenAI, Anthropic, Google, and other providers with just a single line of code change.** The SDK runs anywhere JavaScript runs, handles the complex streaming logic between backend and frontend, and comes with 2.5 million weekly downloads. This reference document distills the publicly accessible content from Matt Pocock's comprehensive crash course into a practical guide for using AI SDK v5 effectively.

## Core concepts and architecture

The AI SDK consists of three main components that work together to simplify AI development. The **core package** (`ai`) runs anywhere JavaScript runs and provides the fundamental functions. The **UI hooks** integrate with major frameworks through packages like `@ai-sdk/react`, `@ai-sdk/vue`, `@ai-sdk/svelte`, and `@ai-sdk/angular`. The architecture intentionally separates backend logic from frontend rendering, making it easy to build responsive AI experiences without reinventing complex streaming infrastructure.

### Understanding vendor lock-in avoidance

One of the SDK's primary strengths is **preventing vendor lock-in through a unified API**. Instead of learning different APIs for each provider, you install provider-specific packages like `@ai-sdk/openai`, `@ai-sdk/anthropic`, or `@ai-sdk/google`, then use the same function calls regardless of provider. When providers add new features, the AI SDK typically supports them on release day or within days. This means learning one set of tools gives you access to virtually any LLM provider, with provider updates handled by the open-source community rather than requiring your own integration work.

### Provider switching in practice

Switching between providers requires minimal code changes:

```typescript
// Using OpenAI
import { openai } from '@ai-sdk/openai';
const model = openai('gpt-4');

// Switch to Anthropic with one line change
import { anthropic } from '@ai-sdk/anthropic';
const model = anthropic('claude-3-5-sonnet-20241022');

// Or Google
import { google } from '@ai-sdk/google';
const model = google('gemini-pro');
```

This unified interface means the rest of your codebase remains unchanged when switching providers, making it trivial to compare models or migrate between services.

## The four core functions

AI SDK v5 provides four primary functions that cover most use cases, divided between streaming and non-streaming operations for both text and structured data.

### generateText for non-streaming text

The `generateText()` function generates complete text responses without streaming, making it ideal for **automation tasks, agent implementations, and non-interactive use cases** like drafting emails or summarizing web pages. It supports both single-step and multi-step execution with tool calling.

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { content, usage, toolCalls, toolResults } = await generateText({
  model: openai('gpt-4'),
  system: 'You are a helpful assistant',
  prompt: 'Your prompt here'
});
```

The result object provides several key properties: **content** contains the generated text from the last step, **sources** includes reference sources when supported by the model, **toolCalls** and **toolResults** capture tool interactions, and **usage** provides detailed token consumption data including `promptTokens`, `completionTokens`, and `totalTokens`.

### streamText for real-time responses

The `streamText()` function streams text as it's generated, essential for **interactive applications where users expect immediate feedback**. Unlike `generateText()`, streaming starts immediately and supports backpressure (generating tokens only as they're requested). Errors become part of the stream rather than throwing, ensuring uninterrupted user experience.

```typescript
import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

const stream = streamText({
  model: google('gemini-2.0-flash-lite'),
  prompt: 'Which country makes the best sausages?'
});

// Stream to terminal
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

// Access usage after streaming completes
const usage = await stream.usage;
console.log(usage); // { promptTokens, completionTokens, totalTokens }
```

The function provides multiple **stream helpers** for different use cases: `toUIMessageStreamResponse()` creates HTTP responses for UI message streams, `pipeUIMessageStreamToResponse()` writes to Node.js response objects, `toTextStreamResponse()` creates simple text streams, and `pipeTextStreamToResponse()` writes text deltas directly to responses.

### generateObject and streamObject for structured data

These functions generate type-safe structured data validated with Zod schemas. **`generateObject()` returns complete JSON structures**, while **`streamObject()` validates structures in real-time as they stream**, enabling reactive UIs that update as each field becomes available.

## Understanding UIMessageStreams

UIMessageStreams represent the most important streaming mechanism in the SDK because they handle the complex data that LLMs return beyond simple text. While terminal applications can use simple text streams, **UIs need structured messages that include text parts, tool calls, tool results, reasoning tokens, sources, and metadata**.

### Message stream structure and lifecycle

A UIMessageStream outputs a sequence of structured objects that follow a predictable lifecycle:

```javascript
const stream = streamText({
  model,
  prompt: 'Give me a sonnet about a cat called Steven.',
});

for await (const chunk of stream.toUIMessageStream()) {
  console.log(chunk);
}
```

This produces objects with distinct types flowing in sequence: **`{ type: 'start' }`** initializes the stream, **`{ type: 'start-step' }`** begins a processing step, **`{ type: 'text-start', id: '0' }`** signals text generation starting with a unique ID, **`{ type: 'text-delta', id: '0', delta: 'A' }`** delivers incremental text chunks, and finally **`{ type: 'text-end', id: '0' }`**, **`{ type: 'finish-step' }`**, and **`{ type: 'finish' }`** signal completion at different levels.

### Message parts and rendering

Messages in AI SDK v5 use a **parts array** rather than a simple content string, enabling elegant handling of multimodal content. Each part has a specific type that determines how it should be rendered:

**Text parts** contain a `text` property with string content. **File parts** include `url`, `mediaType`, and `filename` for images and documents. **Tool-invocation parts** capture tool calls with their inputs and outputs. **Reasoning parts** contain reasoning tokens from models like DeepSeek. **Source-url and source-document parts** reference web pages and documents. **Data parts** allow custom structured data to be embedded in messages.

```javascript
// Recommended rendering approach using parts
{messages.map(message => (
  <div key={message.id}>
    {message.parts.map((part, index) => {
      if (part.type === 'text') {
        return <span key={index}>{part.text}</span>;
      }
      if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
        return <img key={index} src={part.url} alt={part.filename} />;
      }
      if (part.type === 'reasoning') {
        return <pre key={index}>{part.text}</pre>;
      }
      return null;
    })}
  </div>
))}
```

## Streaming to React applications

The `useChat` hook from `@ai-sdk/react` handles all streaming complexity for building chat interfaces, automatically managing state for messages, input, loading states, and errors.

### Frontend implementation with useChat

The hook provides everything needed for a complete chat interface through a simple API:

```javascript
'use client';
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat({});
  const [input, setInput] = useState('');

  return (
    <>
      {messages.map(message => (
        <div key={message.id}>
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) =>
            part.type === 'text' ? <span key={index}>{part.text}</span> : null
          )}
        </div>
      ))}

      <form onSubmit={e => {
        e.preventDefault();
        if (input.trim()) {
          sendMessage({ text: input });
          setInput('');
        }
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
          placeholder="Say something..."
        />
        <button type="submit" disabled={status !== 'ready'}>
          Submit
        </button>
      </form>
    </>
  );
}
```

The hook returns **messages** (array of UIMessage objects), **sendMessage(options)** function to send new messages, **status** indicating current state ('ready', 'submitted', 'streaming', or 'error'), plus additional methods like **stop()** to abort streaming, **regenerate()** to regenerate the last message, **setMessages()** for manual message management, and **reload()** to retry after errors.

### Backend API route implementation

The backend receives UIMessages from the frontend, converts them to ModelMessages for the LLM, streams the response, and returns a UIMessageStream:

```typescript
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

The critical conversion function **`convertToModelMessages()`** transforms UIMessages (optimized for UI state and persistence) into ModelMessages (optimized for LLM consumption). This separation allows each message format to serve its specific purpose effectively.

### Communication flow and message types

When a user sends a message, `sendMessage()` triggers a POST to `/api/chat` with the entire message history as UIMessages. The backend converts these to ModelMessages, calls `streamText()`, converts the result to a UIMessageStream, and streams it back. The `useChat` hook receives and processes stream chunks in real-time, updating the UI as deltas arrive.

**UIMessages** serve as the source of truth for application state and persistence, containing all metadata, custom data parts, and UI-specific information. **ModelMessages** are the optimized format for communicating with LLMs, stripped of UI-specific concerns and structured for efficient token usage.

## Request configuration and customization

The SDK provides flexible options for customizing requests at both hook-level (applying to all requests) and request-level (for individual messages).

### Hook-level configuration

Configure transport settings that apply to all requests made through the hook:

```typescript
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/custom-chat',
    headers: {
      Authorization: 'your_token',
    },
    body: {
      user_id: '123',
    },
    credentials: 'same-origin',
  }),
});
```

Dynamic configuration using functions allows access to runtime state:

```typescript
headers: () => ({
  Authorization: `Bearer ${getAuthToken()}`,
  'X-User-ID': getCurrentUserId(),
}),
```

### Request-level configuration for flexibility

Request-level configuration is **recommended for most use cases** because it provides maximum flexibility:

```typescript
sendMessage(
  { text: input },
  {
    headers: {
      Authorization: 'Bearer token123',
    },
    body: {
      temperature: 0.7,
      customKey: 'customValue',
    },
  }
);
```

On the server side, access these custom fields through the request body:

```typescript
export async function POST(req: Request) {
  const { messages, customKey }: {
    messages: UIMessage[];
    customKey: string
  } = await req.json();
  // Use customKey for per-request configuration
}
```

## Advanced streaming patterns

For complex use cases beyond basic streaming, the SDK provides powerful composition patterns through the writer API.

### Merging streams and adding custom data

The **writer pattern** allows merging multiple streams and adding custom data parts:

```typescript
import { createUIMessageStream } from 'ai';

const stream = createUIMessageStream({
  async write({ writer }) {
    // 1. Stream initial response
    const streamTextResult = streamText({
      model: mainModel,
      messages: modelMessages,
    });

    writer.merge(streamTextResult.toUIMessageStream());

    // 2. Wait for completion
    await streamTextResult.consumeStream();

    // 3. Add custom data part
    writer.write({
      type: 'data-suggestions',
      id: 'suggestions-1',
      data: ['Follow-up question 1', 'Follow-up question 2'],
    });
  },
});
```

This pattern enables **streaming an initial AI response, then appending suggested follow-up questions** or other metadata after the main response completes.

### Custom message types with TypeScript

Define type-safe custom messages for better developer experience:

```typescript
type MyMessage = UIMessage<
  never, // No metadata
  {
    'data-suggestions': string[];
  }
>;

const { messages } = useChat<MyMessage>({});
```

TypeScript now knows that messages can include `data-suggestions` parts, providing autocomplete and type checking.

### Transport customization for specialized APIs

Modify the request format when your API has specific requirements:

```typescript
transport: new DefaultChatTransport({
  prepareSendMessagesRequest: ({ id, messages }) => {
    return {
      body: {
        id,
        message: messages[messages.length - 1], // Send only last message
      },
    };
  },
}),
```

## Message metadata and tracking

Metadata allows attaching custom information to messages for tracking, analytics, or display purposes.

### Adding metadata on the backend

Use the `messageMetadata` callback to attach data at different stages:

```typescript
return result.toUIMessageStreamResponse({
  messageMetadata: ({ part }) => {
    if (part.type === 'start') {
      return {
        createdAt: Date.now(),
        model: 'gpt-4o'
      };
    }
    if (part.type === 'finish') {
      return {
        totalTokens: part.totalUsage.totalTokens,
        finishReason: part.finishReason
      };
    }
  },
});
```

### Accessing metadata on the frontend

Read metadata from messages in your UI components:

```javascript
{messages.map(message => (
  <div key={message.id}>
    {message.metadata?.createdAt &&
      <span>{new Date(message.metadata.createdAt).toLocaleTimeString()}</span>
    }
    {/* Message content */}
    {message.metadata?.totalTokens &&
      <span>{message.metadata.totalTokens} tokens used</span>
    }
  </div>
))}
```

## Token usage tracking and monitoring

The SDK provides built-in functionality to track token consumption, essential for **monitoring costs, optimizing prompts, and understanding model behavior**.

### Accessing usage data

Usage information is available as a property on output objects, but **must be awaited** since it might be a promise:

```typescript
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

const output = streamText({
  model: google('gemini-2.0-flash-lite'),
  prompt: 'Which country makes the best sausages?',
});

// Stream the text
for await (const chunk of output.textStream) {
  process.stdout.write(chunk);
}

// Access usage after streaming completes
const usage = await output.usage;
console.log(usage);
```

The usage object contains several properties detailing token consumption for the request, including prompt tokens, completion tokens, and total tokens. Usage tracking works consistently across all providers in the SDK.

## System prompts and configuration

System prompts define the AI's behavior and constraints, applied consistently across all messages in a conversation.

```typescript
const result = await generateText({
  model: openai('gpt-4'),
  system: 'You are a helpful assistant that always responds in a professional tone',
  prompt: 'User query here'
});
```

With streaming, the pattern remains identical:

```typescript
const stream = streamText({
  model: model,
  system: 'You are a creative writing assistant specializing in poetry',
  prompt: 'Write a haiku about winter'
});
```

## Error handling and production considerations

Production applications require robust error handling to provide good user experience and facilitate debugging.

### Masking sensitive errors

By default, mask error details to avoid exposing implementation details:

```typescript
return result.toUIMessageStreamResponse({
  onError: error => 'An error occurred',
});
```

### Throttling UI updates for performance

When streaming generates many updates, throttle to improve performance:

```typescript
const { messages } = useChat({
  experimental_throttle: 50, // Update UI every 50ms instead of every chunk
});
```

### Status handling for better UX

Disable inputs during streaming and show appropriate loading states:

```javascript
<input
  value={input}
  onChange={e => setInput(e.target.value)}
  disabled={status !== 'ready'}
/>
<button type="submit" disabled={status !== 'ready'}>
  {status === 'streaming' ? 'Sending...' : 'Submit'}
</button>
```

## Setup and environment configuration

Getting started with the AI SDK requires minimal setup, with exercises available through an interactive GitHub repository.

### Initial setup steps

```bash
# Clone the crash course repository
git clone https://github.com/ai-hero-dev/ai-sdk-v5-crash-course.git
cd ai-sdk-v5-crash-course

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
```

Add your API keys to the `.env` file for any providers you plan to use. API keys are available from OpenAI Platform, Anthropic Console, and Google AI Studio.

### Running the interactive exercises

```bash
# Standard mode
pnpm dev

# Simple mode for unusual operating systems
pnpm dev --simple

# Jump to specific exercise
pnpm exercise <exercise-number>
```

The crash course contains **57 exercises across 10 modules**, each with video tutorials, written explanations, and step-by-step completion guides. Exercises follow a consistent structure with a problem to solve, detailed readme, TODO comments in code, reference solutions, and explainer sections for complex topics.

## Best practices for production applications

Following these patterns ensures robust, maintainable AI applications.

### Always render with parts property

Use the `parts` array instead of `content` for flexibility with multimodal content, tool calls, and structured data:

```javascript
{message.parts.map((part, index) => {
  // Handle each part type appropriately
})}
```

### Maintain conversation context

The entire message history is sent with each request, allowing the LLM to see all previous messages and maintain context across the conversation. This automatic context management is crucial for coherent multi-turn conversations.

### Separate message types by purpose

Keep UIMessages as your source of truth for application state and persistence, while ModelMessages remain the optimized format for LLM communication. Always use `convertToModelMessages()` for the conversion rather than manual transformation.

### Network debugging workflow

Check the Network tab in browser DevTools to see the full request body with messages array, observe UIMessageStream chunks being streamed in real-time, and understand the different chunk types (start, text-delta, finish, etc.) flowing through your application.

### Performance and optimization

For high-frequency updates, implement throttling to reduce render cycles. Track token usage to monitor costs. Consider prompt caching strategies for repeated queries. Use streaming for interactive experiences to reduce time-to-first-token and improve perceived performance.

## Conclusion

AI SDK v5 represents a mature, production-ready approach to building AI applications in TypeScript. **The unified API eliminates vendor lock-in while streaming infrastructure handles the complex backend-to-frontend communication that would require substantial custom implementation.** Type safety throughout, from backend tool definitions to frontend message rendering, catches errors at compile-time rather than runtime. The course's publicly accessible content covers fundamental concepts—streaming text, handling messages, tracking usage, and integrating with React applications—providing a solid foundation for building sophisticated AI experiences. With provider-agnostic architecture, automatic message context management, and built-in production features like error handling and monitoring, the SDK reduces the implementation overhead for AI features by an estimated 2-3x compared to manual integration, while the open-source community ensures ongoing maintenance and provider updates.