# P1: Media URL Resolution & Schema Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix media URL resolution to prioritize R2 URLs, align TemplateVariable schema across codebase, and add elasticity rule editor UI.

**Architecture:** Update VideoPlayer to prioritize R2 publicUrl, standardize TemplateVariable type, create elasticity rule editor component.

**Tech Stack:** React, TypeScript, Zod validation, PostgreSQL

**Estimated Time:** 2-3 hours

---

## Phase 1: Fix Media URL Resolution

### Task 1.1: Update VideoPlayer URL Priority

**Files:**

- Modify: `app/video-compositions/VideoPlayer.tsx:221-270`

**Steps:**

1. Update image/video/audio URL resolution to prioritize: `publicUrl || mediaUrlRemote || mediaUrlLocal`
2. Add debug logging for URL selection in development mode
3. Test with existing scenes
4. Commit: "fix(render): prioritize R2 publicUrl for media resolution"

### Task 1.2: Ensure publicUrl is Populated

**Files:**

- Modify: `app/hooks/useMediaBin.ts`, `app/hooks/useR2Upload.ts`, `app/routes/api.r2.confirm-upload.tsx`

**Steps:**

1. Add `publicUrl` to R2UploadResult interface
2. Update upload success handler to set publicUrl
3. Update API response to include publicUrl
4. Test upload flow
5. Commit: "fix(r2): ensure publicUrl is populated on upload"

### Task 1.3: Add Database Migration

**Files:**

- Create: `migrations/008_add_public_url.sql`

**Steps:**

1. Add `public_url` column to assets table
2. Add index for public_url lookups
3. Run migration
4. Commit: "feat(db): add public_url column to assets table"

---

## Phase 2: Align TemplateVariable Schema

### Task 2.1: Unify TemplateVariable Type

**Files:**

- Modify: `app/schemas/timeline.ts`, `app/components/timeline/types.ts`

**Steps:**

1. Update TemplateVariableSchema to include `id`, `required`, `description`
2. Remove duplicate type definition in types.ts
3. Update all imports to use unified type
4. Fix TypeScript errors
5. Commit: "refactor(types): unify TemplateVariable schema"

### Task 2.2: Migrate Scene Variables

**Files:**

- Create: `scripts/migrate-scene-variables.ts`

**Steps:**

1. Create migration script to add `id` field to existing variables
2. Run migration on database
3. Verify migration success
4. Commit: "feat(migration): migrate scene variables to unified schema"

---

## Phase 3: Add Elasticity Rule Editor UI

### Task 3.1: Create ElasticityRuleEditor Component

**Files:**

- Create: `app/components/scenes/ElasticityRuleEditor.tsx`

**Steps:**

1. Create component with fixed/stretch radio buttons per scrubber
2. Filter to show only video/audio scrubbers
3. Handle rule updates
4. Commit: "feat(ui): add elasticity rule editor component"

### Task 3.2: Integrate into Scene Settings

**Files:**

- Modify: `app/components/scenes/ScenesPanel.tsx`

**Steps:**

1. Add "Elasticity" tab to scene settings dialog
2. Wire up ElasticityRuleEditor component
3. Test in browser
4. Commit: "feat(ui): integrate elasticity editor into scene settings"

---

## Phase 4: Testing

### Task 4.1: Integration Test

**Files:**

- Create: `scripts/test-p1-integration.ts`

**Steps:**

1. Create test script to verify schema, elasticity rules, and media URLs
2. Run test
3. Commit: "test: add P1 integration tests"

---

## Verification Checklist

- [ ] TypeScript compiles without errors
- [ ] Media URLs prioritize R2 publicUrl
- [ ] TemplateVariable schema is consistent
- [ ] Elasticity rule editor works in browser
- [ ] Integration test passes

---

## Next Steps

After P1: Proceed to P2 (public templates, full R2 integration, scene composition API)
