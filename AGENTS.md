# AGENTS.md

Guidelines for AI coding agents working in this repository.

## Build & Development Commands

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Formatting
pnpm format          # Fix formatting
pnpm format:check    # Check formatting

# Database migrations
pnpm migrate
```

**Package Manager:** Use `pnpm` (NOT npm). Lock file is `pnpm-lock.yaml`.

## Code Style

### Formatting (Prettier)

- Print width: 120
- Single quotes: false (use double quotes)
- Trailing commas: all
- Semicolons: true
- Tab width: 2 spaces (no tabs)
- Bracket same line: true

### TypeScript

- Strict mode enabled
- Target: ES2022
- Module: ES2022
- Use `import type` for type-only imports
- Path alias: `~/*` maps to `./app/*`

### ESLint Rules

- No explicit `any` (error)
- No unused vars (off - use TypeScript instead)
- React hooks rules enforced
- No debugger (error)
- No console (off - allowed)
- Prefer const

### Imports

```typescript
// External imports first
import { useState } from "react";
import { z } from "zod";

// Internal imports with ~ alias
import { requireUserId } from "~/lib/auth.utils";
import { ConfirmUploadBodySchema } from "~/schemas/apis/r2";
```

## Naming Conventions

- **Components:** PascalCase (e.g., `RenderStatus.tsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useRenderer.ts`)
- **Routes:** Files in `app/routes/` use dot notation (e.g., `api.r2.confirm-upload.tsx`)
- **Utils/Helpers:** camelCase (e.g., `timeline-utils.ts`)
- **Types/Interfaces:** PascalCase with descriptive names
- **Constants:** UPPER_SNAKE_CASE for true constants
- **API Schemas:** Suffix with `Schema` (e.g., `ConfirmUploadBodySchema`)

## API Route Patterns

API routes use Zod for validation:

```typescript
import { z } from "zod";
import { SomeBodySchema } from "~/schemas/apis/resource";

// Helper for consistent errors
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request }: { request: Request }) {
  try {
    const body = await request.json();
    const data = SomeBodySchema.parse(body);
    // ... handle logic
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "Invalid request data", details: error.issues }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return jsonError("Internal server error", 500);
  }
}
```

## Error Handling

- Use `try/catch` for async operations
- Validate with Zod schemas for API inputs
- Return proper HTTP status codes (400 for validation, 404 for not found, 500 for server errors)
- Log errors with `console.error` for debugging
- Use `jsonError()` helper pattern in API routes

## React Patterns

- Functional components only
- Hooks follow React rules (no conditional hooks)
- Custom hooks in `app/hooks/`
- Components in `app/components/` or co-located
- Props destructuring in function parameters

## Database

- Uses PostgreSQL with `pg` driver
- Connection string from `DATABASE_URL`
- Always close pools with `pool.end()`
- Use parameterized queries (`$1, $2`)

## Project Structure

```
app/
  components/       # Reusable UI components
  hooks/           # Custom React hooks
  lib/             # Utilities, database, auth
  routes/          # React Router routes
  schemas/         # Zod schemas (apis/, components/)
  services/        # Server-side services
  utils/           # General utilities
  video-compositions/  # Remotion video components
```

## Key Dependencies

- React 19 + React Router 7
- Remotion 4.0.420 (video rendering)
- Zod 4.0.9 (validation)
- Tailwind CSS 4 (styling)
- Better Auth (authentication)
- Radix UI (headless components)
- Axios (HTTP client)

## Git Workflow

- Check `docs/plans/` for implementation plans
- Update plan progress when completing tasks
- Follow existing patterns in similar files
- Run `pnpm typecheck` and `pnpm lint` before committing

## Testing

No test framework currently configured. Manual testing via UI.

## Environment

- Node.js with ES modules (`"type": "module"`)
- Environment variables in `.env` (see `.env.example`)
- Docker Compose available for development

## Notes

- This is a video editor with React Router + Remotion Lambda
- Authentication required for most API routes (use `requireUserId`)
- File storage uses Cloudflare R2
- Video rendering via AWS Lambda (Remotion)
