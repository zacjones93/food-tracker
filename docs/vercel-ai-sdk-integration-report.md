# Vercel AI SDK Integration with Cloudflare Workers Next.js - Comprehensive Report

**Project Context**: Food Tracker application running Next.js 15 on Cloudflare Workers via OpenNext
**Date**: October 2025
**Current Dependencies**: ZSA (zod-server-actions) with Zod v3.25.28

---

## Executive Summary

**RECOMMENDATION: Dual Zod versions (v3 + v4) ARE viable and officially supported.**

Your proposed approach works perfectly. Zod provides built-in subpath versioning specifically for this use case. You can:
- Keep ZSA using Zod v3 via `import * as z3 from "zod/v3"`
- Use AI SDK with Zod v4 via `import * as z4 from "zod/v4"`
- Install a single `zod` package (v3.25.76+) that exports both versions

**Key Findings:**
- ✅ AI SDK v5 works on Cloudflare Workers edge runtime
- ✅ Dual Zod versions officially supported via subpath imports
- ✅ No bundling conflicts or instanceof issues
- ✅ Workers AI + Vercel AI SDK integration well-documented
- ⚠️ OpenNext currently only supports Node.js runtime (not Edge runtime)
- ⚠️ Server Actions not ideal for streaming AI responses (use Route Handlers)

---

## 1. Dual Zod Version Compatibility

### How It Works

**Official Solution**: Zod v3.25.0+ includes subpath exports for both versions:
- `"zod"` or `"zod/v3"` → Zod 3.x
- `"zod/v4"` → Zod 4.x

**Package Dependencies Found:**
```bash
# Current project state
zod: "^3.25.28"
zsa: { peerDependencies: { "zod": "^3.23.5" } }
ai: { peerDependencies: { "zod": "^3.25.76 || ^4.1.8" } }
```

### Implementation Strategy

**Single package.json dependency:**
```json
{
  "dependencies": {
    "zod": "^3.25.76"  // or "^4.1.8" for latest features
  }
}
```

**Usage in your code:**
```typescript
// For ZSA (existing code remains unchanged)
import { z } from "zod";  // Uses Zod v3 by default
import { createServerAction } from "zsa";

const myAction = createServerAction()
  .input(z.object({ name: z.string() }))
  .handler(async ({ input }) => { ... });

// For AI SDK (new code)
import * as z4 from "zod/v4";
import { streamText } from "ai";

const result = await streamText({
  model: openai("gpt-4"),
  messages,
  tools: {
    getRecipe: {
      description: "Get recipe by ID",
      parameters: z4.object({
        recipeId: z4.string()
      })
    }
  }
});
```

### No Bundling Issues

**Research findings:**
- ✅ No duplicate code in bundle (both versions from same package)
- ✅ No instanceof check failures (not using aliased packages)
- ✅ Officially supported by Zod team
- ✅ Used by production libraries (zod-config, etc.)

**Alternative approaches eliminated:**
- npm aliases → Causes instanceof failures, bloated bundles
- Separate packages → Version conflicts, peer dependency hell
- Migrate ZSA → Unnecessary given subpath solution

---

## 2. Vercel AI SDK on Cloudflare Workers

### Compatibility Status

**✅ AI SDK v5 works on Cloudflare Workers:**
- Supported runtimes: Node.js, Cloudflare Workers, Vercel Edge, Bun
- Works with both Edge Runtime and Node.js runtime
- Streaming responses fully supported
- OpenNext compatibility confirmed

**⚠️ OpenNext Runtime Limitation:**
Your project uses `@opennextjs/cloudflare` which currently:
- Only supports Node.js runtime (not Edge runtime)
- Plans to add Edge runtime in next major release
- Uses Workers Node.js compatibility layer

**Implication**: You're running Node.js runtime on Workers, not Edge runtime. This is fine - AI SDK works in both.

### Cloudflare Workers AI Integration

**Official Cloudflare provider available:**
```bash
pnpm add @cloudflare/workers-ai-provider
```

**Setup with Workers AI binding:**
```typescript
import { createWorkersAI } from '@cloudflare/workers-ai-provider';
import { streamText } from 'ai';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function POST(request: Request) {
  const { env } = await getCloudflareContext();

  const workersai = createWorkersAI({ binding: env.AI });

  const result = await streamText({
    model: workersai('@cf/meta/llama-3-8b-instruct'),
    messages: await request.json(),
  });

  return result.toDataStreamResponse();
}
```

**Critical streaming headers:**
```typescript
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Content-Encoding': 'identity',  // Prevents buffering!
    'Transfer-Encoding': 'chunked',
  }
});
```

### Supported AI Providers

**Compatible with Cloudflare Workers:**
- ✅ Cloudflare Workers AI (native, cheapest)
- ✅ OpenAI (via API)
- ✅ Anthropic (via API)
- ✅ Google Gemini (via API)
- ✅ Cloudflare AI Gateway (proxy for any provider)

**Cloudflare AI Gateway benefits:**
- Unified logging/analytics across providers
- Caching for cost reduction
- Rate limiting
- Cost tracking
- Works with AI SDK out-of-box

---

## 3. Best Practices for AI Agents

### Server Actions vs Route Handlers

**❌ Server Actions NOT recommended for streaming AI:**
- Designed for mutations, not streaming responses
- Cannot return HTTP Response objects
- No streaming support
- Process one action at a time
- No response caching

**✅ Route Handlers (API Routes) recommended:**
- Full HTTP Response control
- Native streaming support
- Proper header management
- Better for long-running operations

**Implementation pattern:**
```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4'),
    messages,
    tools: {
      getRecipe: {
        description: 'Fetch recipe from D1 database',
        parameters: z.object({
          recipeId: z.string(),
        }),
        execute: async ({ recipeId }) => {
          const { env } = await getCloudflareContext();
          const db = drizzle(env.NEXT_TAG_CACHE_D1);
          const recipe = await db.query.recipes.findFirst({
            where: eq(recipes.id, recipeId)
          });
          return recipe;
        }
      }
    },
    onFinish: ({ usage }) => {
      console.log('Tokens used:', usage);
      // Track costs in D1 for budgeting
    }
  });

  return result.toDataStreamResponse();
}
```

### Cost Optimization Strategies

**Token tracking built-in:**
```typescript
const result = await streamText({
  model,
  messages,
  onFinish: async ({ usage, totalUsage, finishReason }) => {
    // usage.promptTokens
    // usage.completionTokens
    // usage.totalTokens

    // Store in D1 for cost tracking
    await db.insert(aiUsageTable).values({
      userId: session.user.id,
      teamId: session.activeTeamId,
      model: 'gpt-4',
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cost: calculateCost(usage),
      createdAt: new Date()
    });
  }
});
```

**Cost comparison (approximate):**
- **Cloudflare Workers AI**: $0.011/1k neurons (cheapest, edge-local)
- **OpenAI GPT-4**: ~$0.03/1k tokens (most capable)
- **OpenAI GPT-4o-mini**: ~$0.0001/1k tokens (good balance)
- **Anthropic Claude 3.5 Sonnet**: ~$0.003/1k tokens (excellent)

**Best practices:**
- Use Cloudflare AI Gateway for caching (can reduce costs 50%+)
- Implement rate limiting per user/team
- Set token limits in AI SDK config
- Use cheaper models for simple tasks
- Cache common responses in KV

### Edge Runtime Performance

**Advantages on Cloudflare Workers:**
- Global edge deployment (~300ms latency reduction)
- Free tier includes 100k requests/day
- No cold starts with Workers
- Integrated with D1/KV/R2 for context retrieval

**Context retrieval pattern (RAG):**
```typescript
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

// 1. Store embeddings in Vectorize
const { embedding } = await embed({
  model: openai.embedding('text-embedding-3-small'),
  value: recipe.recipeBody
});

await env.VECTORIZE.insert({
  id: recipe.id,
  values: embedding,
  metadata: { teamId: recipe.teamId }
});

// 2. Retrieve relevant context
const results = await env.VECTORIZE.query(
  await embed({ model, value: userQuery }),
  { topK: 5 }
);

// 3. Augment prompt with context
const messages = [
  {
    role: 'system',
    content: `Recipes: ${results.map(r => r.metadata).join('\n')}`
  },
  { role: 'user', content: userQuery }
];
```

---

## 4. Step-by-Step Implementation Guide

### Phase 1: Install AI SDK

```bash
cd food-tracker

# Core AI SDK
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic

# Cloudflare Workers AI (optional)
pnpm add @cloudflare/workers-ai-provider

# Upgrade Zod for subpath support
pnpm add zod@^3.25.76  # or zod@^4.1.8 for latest
```

### Phase 2: Add API Key Secrets

**Local development (.dev.vars):**
```bash
# .dev.vars (gitignored)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

**Production secrets:**
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

**Update wrangler.jsonc:**
```jsonc
{
  "vars": {
    "ENVIRONMENT": "production"
  },
  // AI binding for Workers AI (optional)
  "ai": {
    "binding": "AI"
  }
}
```

**Regenerate types:**
```bash
pnpm cf-typegen
```

### Phase 3: Create Chat Route Handler

**File: `src/app/api/chat/route.ts`**
```typescript
import "server-only";
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { getSessionFromCookie } from '@/utils/auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { recipes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import * as z4 from 'zod/v4';  // Use Zod v4 for AI SDK

export const runtime = 'nodejs';  // OpenNext uses Node runtime

export async function POST(req: Request) {
  // Auth check
  const session = await getSessionFromCookie();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get Cloudflare bindings
  const { env } = await getCloudflareContext();
  const db = drizzle(env.NEXT_TAG_CACHE_D1);

  // Parse request
  const { messages } = await req.json();

  // Stream AI response
  const result = await streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    messages,
    system: `You are a helpful cooking assistant. The user belongs to team ${session.activeTeamId}.`,
    tools: {
      getRecipe: {
        description: 'Fetch a recipe by ID from the database',
        parameters: z4.object({
          recipeId: z4.string().describe('Recipe ID (rcp_...)')
        }),
        execute: async ({ recipeId }) => {
          const recipe = await db.query.recipes.findFirst({
            where: eq(recipes.id, recipeId)
          });
          if (!recipe) return { error: 'Recipe not found' };
          return {
            name: recipe.name,
            ingredients: recipe.ingredients,
            recipeBody: recipe.recipeBody,
            mealType: recipe.mealType
          };
        }
      },
      searchRecipes: {
        description: 'Search recipes by name or tag',
        parameters: z4.object({
          query: z4.string()
        }),
        execute: async ({ query }) => {
          // Implement search logic
          const results = await db.query.recipes.findMany({
            where: eq(recipes.teamId, session.activeTeamId!),
            limit: 10
          });
          return results.map(r => ({
            id: r.id,
            name: r.name,
            emoji: r.emoji,
            mealType: r.mealType
          }));
        }
      }
    },
    onFinish: async ({ usage, finishReason }) => {
      // Track token usage for cost monitoring
      console.log('AI Request completed:', {
        userId: session.user.id,
        teamId: session.activeTeamId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        finishReason
      });

      // TODO: Store in D1 for billing/analytics
    }
  });

  // Return streaming response with proper headers
  return result.toDataStreamResponse({
    headers: {
      'Content-Encoding': 'identity'  // Critical for streaming!
    }
  });
}
```

### Phase 4: Create Chat UI Component

**File: `src/app/(dashboard)/ai-assistant/page.tsx`**
```typescript
'use client';

import { useChat } from 'ai/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AIAssistantPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    onError: (error) => {
      console.error('Chat error:', error);
    }
  });

  return (
    <div className="container mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-bold mb-4">AI Cooking Assistant</h1>

      <div className="space-y-4 mb-4 min-h-[400px] max-h-[600px] overflow-y-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-4 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-100 ml-auto max-w-[80%]'
                : 'bg-gray-100 mr-auto max-w-[80%]'
            }`}
          >
            <p className="text-sm font-semibold mb-1">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </p>
            <p className="whitespace-pre-wrap">{message.content}</p>

            {/* Display tool calls */}
            {message.toolInvocations?.map((tool, idx) => (
              <div key={idx} className="mt-2 p-2 bg-white rounded text-xs">
                <span className="font-mono">🔧 {tool.toolName}</span>
                {tool.state === 'result' && (
                  <pre className="mt-1 overflow-auto">
                    {JSON.stringify(tool.result, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ))}

        {isLoading && (
          <div className="bg-gray-100 p-4 rounded-lg">
            <div className="animate-pulse">Thinking...</div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about recipes, meal planning, etc..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading}>
          Send
        </Button>
      </form>
    </div>
  );
}
```

### Phase 5: Update Navigation

**File: `src/layouts/sidebar-nav.tsx`** (or wherever nav is defined)
```typescript
// Add to navigation items
{
  name: 'AI Assistant',
  href: '/ai-assistant',
  icon: SparklesIcon,  // or your preferred icon
}
```

### Phase 6: Testing

**Test dual Zod versions:**
```typescript
// Test file: test-zod-versions.ts
import { z as z3 } from "zod";
import * as z4 from "zod/v4";

console.log('Zod v3:', z3.string().parse('test'));
console.log('Zod v4:', z4.string().parse('test'));

// Ensure no conflicts
const zsaSchema = z3.object({ name: z3.string() });
const aiSchema = z4.object({ name: z4.string() });

console.log('Both versions working!');
```

**Run with:**
```bash
tsx test-zod-versions.ts
```

---

## 5. Potential Gotchas & Limitations

### 1. OpenNext Runtime Limitation

**Issue**: `@opennextjs/cloudflare` uses Node.js runtime, not Edge runtime.

**Impact**:
- ✅ AI SDK works fine in Node runtime
- ⚠️ Some edge-specific APIs unavailable
- ⚠️ Slightly larger bundle than pure edge

**Workaround**: None needed - this is the expected behavior.

### 2. Streaming Response Headers

**Issue**: Cloudflare may buffer responses unless you set correct headers.

**Critical header:**
```typescript
'Content-Encoding': 'identity'  // Prevents gzip buffering
```

**Without this**: Entire AI response buffers before streaming, defeating the purpose.

### 3. D1 Transaction Limitation

**Issue**: D1 doesn't support transactions (documented in your CLAUDE.md).

**Impact for AI**: If tool calls modify database, they can't be rolled back.

**Workaround**:
- Use idempotent operations
- Implement application-level compensation logic
- Consider tool calls "read-only" where possible

### 4. Token Limits & Costs

**Issue**: Uncontrolled AI usage can be expensive.

**Mitigation:**
```typescript
const result = await streamText({
  model,
  messages,
  maxTokens: 1000,  // Hard limit
  maxSteps: 5,      // Tool call limit
  onFinish: async ({ usage }) => {
    const cost = calculateCost(usage);
    if (cost > TEAM_BUDGET) {
      await notifyTeamOwner(session.activeTeamId, cost);
    }
  }
});
```

### 5. Session Management with Streaming

**Issue**: Long-running streams may outlive session cookies.

**Recommendation**: Validate session at request start, not during stream.

### 6. Zod Version Confusion

**Potential issue**: Forgetting which import to use.

**Best practice:**
```typescript
// Establish naming convention:
import { z } from "zod";           // For ZSA/existing code
import * as z4 from "zod/v4";      // For AI SDK only

// Or use aliases for clarity:
import { z as zodV3 } from "zod";
import * as zodV4 from "zod/v4";
```

### 7. Workers AI Model Availability

**Issue**: Not all models available on Workers AI.

**Current offerings (Jan 2025)**:
- Llama 3.2 (1B, 3B, 11B vision)
- Llama 4 Scout
- Text embeddings
- Image generation

**For advanced models**: Use OpenAI/Anthropic via API (adds latency + cost).

---

## 6. Alternative Approaches (If Dual Zod Fails)

**Note**: These are unnecessary given Zod subpath support, but documented for completeness.

### Option A: Migrate ZSA → next-safe-action

**Pros:**
- Both libraries use similar APIs
- next-safe-action actively maintained
- Better Next.js 15 support

**Cons:**
- Migration effort across all server actions
- Syntax differences require careful testing
- Your team is familiar with ZSA

**Migration pattern:**
```typescript
// Before (ZSA)
import { createServerAction } from "zsa";

const myAction = createServerAction()
  .input(z.object({ name: z.string() }))
  .handler(async ({ input }) => { ... });

// After (next-safe-action)
import { createSafeActionClient } from "next-safe-action";

const action = createSafeActionClient();

const myAction = action
  .schema(z.object({ name: z.string() }))
  .action(async ({ parsedInput: { name } }) => { ... });
```

**Recommendation**: Not worth it - stick with ZSA + subpath imports.

### Option B: Use AI SDK without Zod

**Possibility**: AI SDK's Zod dependency is optional peerDependency.

**Cons:**
- Lose type-safe tool parameters
- Manual validation required
- Higher error risk

**Not recommended**: Type safety is a key AI SDK benefit.

### Option C: Fork ZSA to support Zod v4

**Extremely not recommended**:
- Maintenance burden
- Breaks updates
- Unnecessary given subpath solution

---

## 7. Recommended Architecture

### File Structure

```
food-tracker/src/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # AI streaming endpoint
│   └── (dashboard)/
│       └── ai-assistant/
│           └── page.tsx           # Chat UI
├── lib/
│   └── ai/
│       ├── models.ts              # Model configurations
│       ├── prompts.ts             # System prompts
│       ├── tools.ts               # Tool definitions (D1 queries)
│       └── cost-tracking.ts       # Usage analytics
└── db/
    └── schema.ts                  # Add ai_usage table
```

### Database Schema Addition

```typescript
// src/db/schema.ts
export const aiUsageTable = sqliteTable(
  "ai_usage",
  {
    ...commonColumns,
    id: text().primaryKey().$defaultFn(() => createId("aiu")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    model: text().notNull(),
    promptTokens: integer().notNull(),
    completionTokens: integer().notNull(),
    totalTokens: integer().notNull(),
    estimatedCost: real().notNull(),
    endpoint: text().notNull(),
  },
  (table) => [
    index("ai_usage_user_idx").on(table.userId),
    index("ai_usage_team_idx").on(table.teamId),
  ]
);
```

### Cost Tracking Utility

```typescript
// src/lib/ai/cost-tracking.ts
import "server-only";

const MODEL_COSTS = {
  'gpt-4': { prompt: 0.03, completion: 0.06 },
  'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
  'claude-3-5-sonnet-20241022': { prompt: 0.003, completion: 0.015 },
  '@cf/meta/llama-3-8b-instruct': { prompt: 0.000011, completion: 0.000011 },
} as const;

export function calculateCost(model: string, usage: {
  promptTokens: number;
  completionTokens: number;
}) {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  if (!costs) return 0;

  return (
    (usage.promptTokens / 1000) * costs.prompt +
    (usage.completionTokens / 1000) * costs.completion
  );
}

export async function trackUsage(
  db: any,
  userId: string,
  teamId: string,
  model: string,
  usage: { promptTokens: number; completionTokens: number },
  endpoint: string
) {
  await db.insert(aiUsageTable).values({
    userId,
    teamId,
    model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.promptTokens + usage.completionTokens,
    estimatedCost: calculateCost(model, usage),
    endpoint,
  });
}
```

---

## 8. Migration Checklist

- [ ] **Phase 1: Dependencies**
  - [ ] `pnpm add ai @ai-sdk/openai @ai-sdk/anthropic`
  - [ ] `pnpm add zod@^3.25.76` (upgrade for subpath support)
  - [ ] `pnpm add @cloudflare/workers-ai-provider` (optional)

- [ ] **Phase 2: Configuration**
  - [ ] Add API keys to `.dev.vars`
  - [ ] `wrangler secret put OPENAI_API_KEY` (production)
  - [ ] `wrangler secret put ANTHROPIC_API_KEY` (production)
  - [ ] Update `wrangler.jsonc` with AI binding (if using Workers AI)
  - [ ] Run `pnpm cf-typegen`

- [ ] **Phase 3: Database**
  - [ ] Add `ai_usage` table to `src/db/schema.ts`
  - [ ] `pnpm db:generate add-ai-usage-table`
  - [ ] `pnpm db:migrate:local`
  - [ ] Test migration

- [ ] **Phase 4: Implementation**
  - [ ] Create `src/app/api/chat/route.ts`
  - [ ] Create `src/lib/ai/models.ts`
  - [ ] Create `src/lib/ai/tools.ts` with D1 queries
  - [ ] Create `src/lib/ai/cost-tracking.ts`
  - [ ] Test dual Zod imports

- [ ] **Phase 5: UI**
  - [ ] Create `src/app/(dashboard)/ai-assistant/page.tsx`
  - [ ] Add navigation link
  - [ ] Style chat interface
  - [ ] Add loading states

- [ ] **Phase 6: Testing**
  - [ ] Test streaming responses
  - [ ] Test tool calling with D1 queries
  - [ ] Test cost tracking
  - [ ] Test authentication/authorization
  - [ ] Load test (rate limiting)
  - [ ] Test Zod v3/v4 compatibility

- [ ] **Phase 7: Monitoring**
  - [ ] Set up cost alerts
  - [ ] Add usage analytics page
  - [ ] Implement rate limiting per team
  - [ ] Add error tracking

---

## 9. Cost Estimation Examples

### Scenario 1: Recipe Assistant (OpenAI GPT-4o-mini)

**Assumptions:**
- 100 users per team
- 10 queries per user per week
- Average 500 prompt tokens + 200 completion tokens per query

**Monthly cost:**
```
100 users × 10 queries/week × 4 weeks = 4,000 queries/month
4,000 × (500 prompt + 200 completion) = 2,800,000 tokens
2,800,000 ÷ 1000 × $0.00015 (prompt) + 800,000 ÷ 1000 × $0.0006 (completion)
= $0.42 + $0.48 = $0.90/month per team
```

**Verdict**: Very affordable with GPT-4o-mini.

### Scenario 2: Meal Planning Agent (Anthropic Claude)

**Assumptions:**
- 50 queries per week per team
- Average 2,000 prompt tokens + 500 completion tokens
- Multiple tool calls (recipe searches)

**Monthly cost:**
```
50 × 4 weeks = 200 queries/month
200 × (2,000 prompt + 500 completion) = 500,000 tokens
500,000 ÷ 1000 × $0.003 + 100,000 ÷ 1000 × $0.015
= $1.50 + $1.50 = $3.00/month per team
```

**Verdict**: Still very affordable.

### Scenario 3: Cloudflare Workers AI (Cheapest)

**Pricing**: $0.011 per 1,000 neurons

**Same usage as Scenario 1:**
```
4,000 queries × 700 tokens average = 2,800,000 neurons
2,800,000 ÷ 1,000 × $0.011 = $30.80/month
```

**Wait, that's more expensive?** Yes - Workers AI pricing model is different. Best for:
- Simple tasks (smaller token counts)
- Edge performance requirements
- Free tier experimentation

---

## 10. Conclusion

**Your proposed plan works perfectly.** The Zod team designed subpath imports specifically for scenarios like yours.

**Recommended implementation:**
1. Upgrade `zod` to `^3.25.76` or `^4.1.8`
2. Keep ZSA using default `import { z } from "zod"`
3. Use AI SDK with `import * as z4 from "zod/v4"`
4. Start with Route Handlers (not Server Actions) for streaming
5. Use Anthropic Claude or OpenAI GPT-4o-mini for cost-effectiveness
6. Implement cost tracking from day 1

**No migration needed.** No workarounds. Just upgrade Zod and use subpath imports.

**Next steps:**
1. Install AI SDK packages
2. Add secrets to Cloudflare
3. Create `/api/chat` route
4. Build chat UI with `useChat` hook
5. Integrate D1 queries as tools
6. Add cost tracking

**Estimated implementation time**: 4-8 hours for basic chat + tool calling.

---

## Appendix: Useful Resources

**Official Documentation:**
- AI SDK Docs: https://ai-sdk.dev/
- Cloudflare Workers AI: https://developers.cloudflare.com/workers-ai/
- Zod Versioning: https://zod.dev/v4/versioning
- OpenNext Cloudflare: https://opennext.js.org/cloudflare

**Code Examples:**
- Workers AI + AI SDK: https://github.com/cloudflare/workers-ai-provider
- AI SDK Next.js Starter: https://github.com/vercel/ai/tree/main/examples/next-app
- Cloudflare RAG Example: https://github.com/kristianfreeman/cloudflare-retrieval-augmented-generation-example

**Community:**
- AI SDK Discord: https://discord.gg/ai-sdk
- Cloudflare Discord: https://discord.gg/cloudflaredev
