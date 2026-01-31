<!--
Sync Impact Report:
- Version Change: Template → 1.0.0
- Principles Defined:
  - I. AI-Native & User-Centric
  - II. High-Performance & Real-Time
  - III. Local-First & Offline-Capable
  - IV. Type Safety & Code Quality
  - V. Dual-License Compatibility
- Templates Verified:
  - .specify/templates/plan-template.md (Compatible)
  - .specify/templates/spec-template.md (Compatible)
  - .specify/templates/tasks-template.md (Compatible)
- Pending Actions: None
-->

# Kimu Constitution

## Core Principles

### I. AI-Native & User-Centric

Core features must leverage AI to simplify complexity (e.g., Vibe AI Assistant). User experience is paramount; tools should be intuitive and "friendly". AI features are first-class citizens, not add-ons.

### II. High-Performance & Real-Time

Editing experience must be real-time with low latency. Previews should not require rendering. Optimization for speed is critical. "See every change instantly".

### III. Local-First & Offline-Capable

Data should be stored locally first for speed and privacy, with optional cloud sync. The app must function reliably offline using local datastores.

### IV. Type Safety & Code Quality

Strict usage of TypeScript is non-negotiable. Zod must be used for runtime validation. ESLint and Prettier compliance is mandatory for all contributions. Components must be modular and reusable.

### V. Dual-License Compatibility

All contributions are subject to dual-licensing (AGPL + Commercial). Contributors must agree to the CLA upon submission. Code must be free of dependencies incompatible with this licensing model.

## Technical Stack Constraints

- **Frontend**: React 19+, Tailwind CSS v4, Radix UI, Framer Motion.
- **Backend**: Node/Express (Video rendering/Orchestration), Python 3.9+ (FastAPI/AI services).
- **Database**: PostgreSQL.
- **Rendering Engine**: Remotion.
- **Tooling**: Vite, pnpm, Docker.
- **Language**: TypeScript (Primary), Python (AI/ML).

## Development & Contribution Workflow

- **Pull Requests**: All changes must be submitted via Pull Requests. Direct commits to main are restricted.
- **Quality Gates**: All PRs must pass `pnpm run lint`, `pnpm run typecheck`, and build checks before merge.
- **CLA**: Contributors must agree to the Contributor License Agreement (CLA) as outlined in `CONTRIBUTING.md`.
- **Commits**: Follow conventional commit messages (e.g., `feat:`, `fix:`, `docs:`).

## Governance

- **Supremacy**: This Constitution supersedes all other engineering guidelines.
- **Amendments**: Changes to this document require Maintainer consensus and a Pull Request updating the version number.
- **Versioning**: Governance follows Semantic Versioning:
  - MAJOR: Removal or redefinition of core principles.
  - MINOR: Addition of new principles or significant guidance.
  - PATCH: Clarifications, typo fixes, or non-semantic updates.
- **Compliance**: All architectural decisions and code reviews must verify compliance with these principles.

**Version**: 1.0.0 | **Ratified**: 2026-01-31 | **Last Amended**: 2026-01-31
