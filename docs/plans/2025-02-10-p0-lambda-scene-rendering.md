# P0: Scene Rendering Integration with Remotion Lambda

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable full API-driven video rendering with scenes, variables, and elasticity using Remotion Lambda instead of local render server.

**Architecture:** Replace local render server (port 8000) with Remotion Lambda. Deploy Remotion project to S3, use renderMediaOnLambda for serverless rendering with webhooks for completion notifications.

**Tech Stack:** Remotion Lambda, AWS Lambda, S3, React Router, Zod validation

**Estimated Time:** 3-5 hours

**Benefits:** Scalable serverless rendering, no local render server needed, distributed frame rendering, webhook notifications

---

## Phase 1: Setup Remotion Lambda Infrastructure

### Task 1.1: Deploy Lambda Function

**Files:**

- Create: `scripts/deploy-lambda-function.ts`

**Steps:**

1. Install `@remotion/lambda` package
2. Create deployment script using `deployFunction()`
3. Configure: region, timeout (120s), memory (2048MB), disk (2048MB)
4. Run deployment and save function name to .env
5. Commit: "feat(lambda): deploy Remotion Lambda function"

### Task 1.2: Deploy Remotion Project to S3

**Files:**

- Create: `scripts/deploy-remotion-site.ts`

**Steps:**

1. Create deployment script using `deploySite()`
2. Bundle video compositions and upload to S3
3. Save serveUrl to .env
4. Test site accessibility
5. Commit: "feat(lambda): deploy Remotion project to S3"

### Task 1.3: Add Lambda Configuration

**Files:**

- Modify: `.env.example`
- Create: `app/lib/lambda-config.server.ts`

**Steps:**

1. Add Lambda env vars: LAMBDA_REGION, LAMBDA_FUNCTION_NAME, LAMBDA_SERVE_URL, LAMBDA_BUCKET_NAME
2. Create config helper to load Lambda settings
3. Add validation for required Lambda config
4. Commit: "feat(lambda): add Lambda configuration"

---

## Phase 2: Replace Local Render Server with Lambda

### Task 2.1: Create Lambda Render Service

**Files:**

- Create: `app/services/lambda-render.server.ts`

**Steps:**

1. Import `renderMediaOnLambda` and `getRenderProgress` from `@remotion/lambda/client`
2. Create `startLambdaRender()` function to initiate rendering
3. Create `pollRenderProgress()` function to track progress
4. Add error handling for Lambda failures
5. Commit: "feat(lambda): create Lambda render service"

### Task 2.2: Update Render Endpoint to Use Lambda

**Files:**

- Modify: `app/routes/api.render.tsx` (or create if doesn't exist)

**Steps:**

1. Replace axios call to local server with `renderMediaOnLambda()`
2. Transform timelineData to inputProps format
3. da render and return renderId
4. Add polling endpoint for progress tracking
5. Commit: "feat(lambda): migrate render endpoint to Lambda"

### Task 2.3: Add Webhook Handler for Render Completion

**Files:**

- Create: `app/routes/api.webhooks.render-complete.tsx`

**Steps:**

1. Create webhook endpoint to receive Lambda completion notifications
2. Verify webhook signature
3. Store render results in database or notify client
4. Commit: "feat(lambda): add render completion webhook"

---

## Phase 3: Update Client to Use Lambda Rendering

### Task 3.1: Update useRenderer Hook

**Files:**

- Modify: `app/hooks/useRenderer.ts`

**Steps:**

1. Update to pass scenes, variableValues, applyElasticity
2. Change to POST /api/render (Lambda endpoint)
3. Add progress polling logic
4. Handle renderId and track progress
5. Commit: "feat(renderer): update client to use Lambda rendering"

### Task 3.2: Update home.tsx

**Files:**

- Modify: `app/routes/home.tsx`

**Steps:**

1. Pass scenes and variableValues to handleRenderVideo
2. Add progress UI for Lambda rendering
3. Display render status and download link when complete
4. Commit: r): integrate Lambda rendering in editor"

---

## Phase 4: Create Scene-by-ID Lambda Rendering

### Task 4.1: Create Scene Rendering Endpoint

**Files:**

- Create: `app/routes/api.render-scene.tsx`

**Steps:**

1. Accept projectId, sceneId, variableValues, dimensions
2. Fetch scene from database
3. Validate required variables
4. Transform scene.timeline to inputProps
5. Call `renderMediaOnLambda()` with scene data
6. Return renderId and bucketName
7. Commit: "feat(api): add scene-by-id Lambda rendering endpoint"

### Task 4.2: Add Render Progress Endpoint

**Files:**

- Create: `app/routes/api.render-progress.$renderId.tsx`

**Steps:**

1. Accept renderId as parameter
2. Call `getRenderProgress()` from Lambda
3. Return progress percentage and status
4. Return video URL when complete
5. Commit: "feat(api): add render progress tracking endpoint"

---

## Phase 5: Add Variable Validation

### Task 5.1: Validate Variables Before Rendering

**Files:**

- Modify: `app/routes/api.render-scene.tsx`

**Steps:**

1. Extract required variables from scene.variableSchema
2. Check all required variables are provided
3. Return 400 error with missing variable names
4. Add validation tests
5. Commit: "feat(validation): add variable validation before rendering"

---

## Phase 6: Testing & Documentation

### Task 6.1: End-to-End Lambda Test

**Files:**

- Create: `scripts/test-lambda-rendering-e2e.ts`

**Steps:**

1. Test scene fetch from database
2. Test Lambda render initiation
3. Test progress polling
4. Test video download from S3
5. Verify variable substitution works
6. Commit: "test: add Lambda rendering end-to-end test"

### Task 6.2: Update Documentation

**Files:**

- Modify: `docs/api/scene-rendering.md`
- Create: `docs/guides/lambda-setup.md`

\*\*SteDocument Lambda setup process 2. Document render API endpoints 3. Add progress polling examples 4. Add webhook configuration guide 5. Commit: "docs: add Lambda rendering documentation"

---

## Environment Variables Required

```bash
# .env
REMOION_FUNCTION_NAME=remotion-render-4-0
REMOION_SERVE_URL=https://remotion-bucket.s3.amazonaws.com/sites/my-site
REMOTION_BUCKET_NAME=remotion-renders-bucket
WEBHOOK_SECRET=your-webhook-secret

REMOTION_AWS_ACCESS_KEY_ID=
REMOTION_AWS_SECRET_ACCESS_KEY=
REMOTION_AWS_REGION=eu-west-3

```

---

## Key Differences from Local Rendering

**Before (Local Server):**

- POST to http://localhost:8000/rechronous rendering (wait for video)
- Single server, limited concurrency
- Manual server management

**After (Lambda):**

- POST to /api/render → returns renderId
- Asynchronous rendering (poll for progress)
- Distributed rendering across multiple Lambdas
- Serverless, auto-scaling
- Webhook notifications when complete

---

## Migration Path

1. **Phase 1-2:** Setup Lambda infrastructure (can run parallel to existing local server)
2. **Phase 3-4:** Update client and API (breaking change - remove local server dependency)
3. **Phase 5-6:** Add validation and testing

**Rollback:** Keep local render server code commented out for emergency fallback

---

## Verification Checklist

- [x] Lambda function deployed successfully (Phase 1 - COMPLETED)
- [ ] Remotion project deployed to S3 (NEEDS TO BE DONE)
- [x] API endpoints created (Phase 2 - COMPLETED)
- [ ] Client can initiate Lambda renders (Phase 3 - IN PROGRESS)
- [ ] Progress polling works (Phase 3 - IN PROGRESS)
- [ ] Webhook receives completion notifications (Phase 2 - COMPLETED)
- [ ] Scene-by-ID rendering works (Phase 4 - TODO)
- [ ] Variable validation works (Phase 5 - TODO)
- [ ] End-to-end test passes (Phase 6 - TODO)

## Progress Status

**COMPLETED:**

- ✅ Phase 1: Setup Remotion Lambda Infrastructure (Tasks 1.1-1.3)
- ✅ Phase 2: Replace Local Render Server with Lambda (Tasks 2.1-2.3)

**IN PROGRESS:**

- ⏳ Phase 3: Update Client to Use Lambda Rendering (Tasks 3.1-3.2)

**TODO:**

- ⏳ Phase 4: Create Scene-by-ID Lambda Rendering (Tasks 4.1-4.2)
- ⏳ Phase 5: Add Variable Validation (Task 5.1)
- ⏳ Phase 6: Testing & Documentation (Tasks 6.1-6.2)

---

## Cost Considerations

**Lambda Pricing:**

- ~$0.20 per GB-second
- 2GB RAM, 120s timeout = ~$0.048 per render
- Much cheaper than running dedicated server

**S3 Storage:**

- Minimal cost for site hosting
- Output videos stored in S3

---

## Next Steps

After P0 completion:

1. Remove local render server code (app/videorender/videorender.ts)
2. Proceed to P1 (media URL resolution, schema alignment)
3. Add render queue for managing multiple concurrent renders
4. Consider adding render job database table for tracking
