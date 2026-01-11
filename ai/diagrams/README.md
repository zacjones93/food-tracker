# Unified Impact Diagrams Index

This directory contains all diagrams for the Food Tracker project, following Diagram Driven Development (DDD) methodology.

## Quick Reference

**What is this?** System documentation through user-impact-focused diagrams that show both Front-Stage (user experience) and Back-Stage (technical implementation).

**Who uses this?** Developers, AI assistants, and anyone needing to understand how Food Tracker works from user goals through technical implementation.

**How to read?** Start with Architecture Overview, then explore specific features based on what you're working on.

---

## Architecture Overview

### Core System
- **[System Architecture](architecture/arch-system-overview.md)** - High-level overview showing edge deployment, data flow, and team-scoped security

---

## User Journeys

Complete user workflows showing goal → action → outcome:

- **[Meal Planning Journey](journeys/sequence-meal-planning-journey.md)** - From viewing schedule board to adding recipes and generating grocery lists (5-minute weekly planning)

---

## Features

Detailed breakdowns of major features:

### Core Features
- **[Recipe Collection Management](features/feature-recipe-management.md)** - Browse, search, filter 570+ recipes with instant fuzzy search and advanced filters
- **[Smart Grocery List](features/feature-grocery-list.md)** - Auto-categorized shopping lists with templates and week-to-week transfer
- **[AI-Powered Cooking Assistant](features/feature-ai-assistant.md)** - Natural language meal planning with streaming responses and tool calling

### Coming Soon
- Week Status Management - Moving weeks between current/upcoming/archived
- Recipe Relations - Adding sides and accompaniments to main dishes
- Recipe Books Integration - Filtering by cookbook source

---

## Test Coverage

(To be added as test suite expands)

---

## Refactoring Plans

(To be added when architectural changes are planned)

---

## Key Concepts

### Team-Scoped Multi-Tenancy
All data (recipes, weeks, grocery items, AI chats) belongs to a team. Every database query automatically filtered by `teamId` to prevent data leakage between families.

### Edge Computing Architecture
Running on Cloudflare Workers with:
- **D1 Database**: SQLite at the edge for <10ms queries
- **KV Store**: Session storage with global replication
- **React Server Components**: Zero client JS for most pages
- **ZSA Server Actions**: Type-safe mutations with Zod validation

### AI Integration
- **Gemini 2.5 Flash**: Free during preview, fast responses
- **Streaming**: Real-time word-by-word responses via Vercel AI SDK
- **Tool Calling**: AI can search recipes, query schedules, add items
- **Access Control**: Team-restricted with daily rate limits

### Data Relationships
- **Users** → Teams (via team_membership)
- **Teams** → Recipes, Weeks, Grocery Templates
- **Weeks** ↔ Recipes (many-to-many via week_recipes junction)
- **Recipes** ↔ Recipes (self-referencing for sides)
- **Weeks** → Grocery Items (one-to-many)

---

## Diagram Conventions

### Front-Stage vs Back-Stage
- **Front-Stage**: What users see and experience (UI, actions, outcomes)
- **Back-Stage**: Technical implementation enabling the experience (databases, APIs, computations)

### Impact Annotations
Diagrams include notes explaining:
- ⚡ **Performance**: Why it's fast (edge deployment, client-side search)
- 🔒 **Security**: How data is protected (team scoping, session validation)
- 💰 **Cost**: Why it's economical (free tier, rate limiting)
- ⏱️ **Time Saved**: User productivity gains (5-minute meal planning)

### Mermaid Styling
- No custom fill colors except `#90EE90` for Before/After change highlighting
- User actions in blue-tinted boxes
- Technical components in gray-tinted boxes
- Data storage in rounded database shapes

---

## Last Updated

**2025-01-09** - Initial diagram sync with 6 diagrams created:
- System architecture overview
- Meal planning journey sequence
- AI assistant feature with streaming
- Recipe management feature with fuzzy search
- Grocery list feature with auto-categorization
- This index file

---

## Contributing

When adding new diagrams:

1. **Choose the right directory**:
   - `architecture/` - System-wide diagrams
   - `journeys/` - User workflows (sequence diagrams)
   - `features/` - Feature-specific diagrams
   - `tests/` - Test coverage and strategy
   - `refactoring/` - Before/After improvement plans

2. **Use the template** (see any existing diagram):
   - Title with type/date/related files
   - Purpose statement (1-2 sentences on user value)
   - Mermaid diagram (Front-Stage + Back-Stage)
   - Key Insights section (user impact + technical enablers)
   - Change History

3. **Follow DDD principles**:
   - Show user goals first, implementation second
   - Include impact annotations (performance, security, cost)
   - Explain "why" not just "what"
   - Connect technical decisions to user outcomes

4. **Update this index** after adding diagrams

5. **Use `/sync-diagrams`** command to validate and sync changes
