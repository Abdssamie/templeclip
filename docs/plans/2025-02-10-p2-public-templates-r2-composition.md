# P2: Public Templates, R2 Integration & Scene Composition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable public scene templates, complete R2 cloud storage integration, and add scene composition API for multi-scene videos.

**Architecture:** Add optional authentication for public templates, ensure all media uses R2 storage, create API endpoint for composing multiple scenes into single video.

**Tech Stack:** React Router, R2 storage, Remotion, PostgreSQL

**Estimated Time:** 4-6 hours

---

## Phase 1: Public Scene Templates

### Task 1.1: Add Public Flag to Scenes

**Files:**

- Modify: `app/schemas/timeline.ts`
- Create: `migrations/009_add_scene_public_flag.sql`

**Steps:**

1. Add `isPublic` boolean field to SceneSchema
2. Create migration to add public flag to existing scenes
3. Update scene creation to default isPublic to false
4. Commit: "feat(schema): add public flag to scenes"

### Task 1.2: Update Scene API for Public Access

**Files:**

- Modify: `app/routes/api.scenes.$.tsx`

**Steps:**

1. Make authentication optional for public scenes
2. Add query parameter `?public=true` to filter public scenes
3. Update authorization logic to allow public scene access
4. Test with public and private scenes
5. Commit: "feat(api): enable public scene access"

### Task 1.3: Add Public Template Gallery UI

**Files:**

- Create: `app/routes/templates.tsx`
- Create: `app/components/templates/TemplateGallery.tsx`

**Steps:**

1. Create template gallery page
2. Fetch and display public scenes
3. Add preview and "Use Template" button
4. Commit: "feat(ui): add public template gallery"

---

## Phase 2: Complete R2 Integration

### Task 2.1: Migrate Local Storage to R2

**Files:**

- Create: `scripts/migrate-local-to-r2.ts`

**Steps:**

1. Create migration script to upload local files to R2
2. Update asset records with R2 keys and public URLs
3. Run migration (with dry-run option)
4. Commit: "feat(migration): migrate local storage to R2"

### Task 2.2: Remove Local Storage Fallback

**Files:**

- Modify: `app/hooks/useMediaBin.ts`, `app/video-compositions/VideoPlayer.tsx`

**Steps:**

1. Remove local blob URL creation
2. Require R2 upload for all new media
3. Update error handling for missing R2 URLs
4. Commit: "refactor(storage): remove local storage fallback"

### Task 2.3: Add R2 Health Check

**Files:**

- Create: `app/routes/api.health.r2.tsx`

**Steps:**

1. Create endpoint to test R2 connectivity
2. Verify bucket access and credentials
3. Return status and configuration info
4. Commit: "feat(api): add R2 health check endpoint"

---

## Phase 3: Scene Composition API

### Task 3.1: Create Scene Composition Schema

**Files:**

- Modify: `app/schemas/timeline.ts`

**Steps:**

1. Update SceneCompositionSchema with scene order and transitions
2. Add validation for scene references
3. Commit: "feat(schema): enhance scene composition schema"

### Task 3.2: Create Composition Rendering Endpoint

**Files:**

- Create: `app/routes/api.render-composition.tsx`

**Steps:**

1. Create POST /api/render-composition endpoint
2. Accept array of scene IDs with transitions
3. Merge scenes into single timeline
4. Apply transitions between scenes
5. Forward to render server
6. Commit: "feat(api): add scene composition rendering endpoint"

### Task 3.3: Add Composition Builder UI

**Files:**

- Create: `app/components/scenes/CompositionBuilder.tsx`

**Steps:**

1. Create drag-and-drop scene ordering interface
2. Add transition selector between scenes
3. Add preview and render buttons
4. Commit: "feat(ui): add scene composition builder"

---

## Phase 4: Testing & Documentation

### Task 4.1: Integration Tests

**Files:**

- Create: `scripts/test-p2-integration.ts`

**Steps:**

1. Test public scene access
2. Test R2 upload and retrieval
3. Test scene composition rendering
4. Commit: "test: add P2 integration tests"

### Task 4.2: Update Documentation

**Files:**

- Modify: `docs/api/scene-rendering.md`
- Create: `docs/guides/public-templates.md`
- Create: `docs/guides/scene-composition.md`

**Steps:**

1. Document public template API
2. Document scene composition API
3. Add usage examples
4. Commit: "docs: add P2 feature documentation"

---

## Verification Checklist

- [ ] Public scenes accessible without authentication
- [ ] All media uses R2 storage
- [ ] Scene composition API works end-to-end
- [ ] Template gallery displays public scenes
- [ ] Integration tests pass

---

## Next Steps

After P2: Production deployment, monitoring, performance optimization
