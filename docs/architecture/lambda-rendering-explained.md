# Lambda Rendering Architecture - Explained

## Quick Answer to Your Questions

### Q: Why did we create a Lambda function AND deploy a site to S3?

**Lambda Function** = The compute power that renders your videos
**S3 Site** = Your video composition code that Lambda executes

Think of it like this:

- Lambda Function = A powerful computer in the cloud
- S3 Site = The software/instructions you give that computer

### Q: Can the S3 site render any template payload via API?

**YES!** The S3 site contains your `TimelineComposition` which is like a flexible video template. You can send it:

- Different timeline data (different scenes, scrubbers, transitions)
- Different dimensions (1920x1080, 1080x1080, etc.)
- Different variables (headline, subtitle, background video URLs)

And it will render completely different videos each time.

---

## The Two Components Explained

### 1. Lambda Function (The Worker)

**File:** `scripts/deploy-lambda-function.ts`

**What it is:** An AWS Lambda function that Remotion manages

**Configuration:**

- Name: `remotion-render-4-0-420-mem2048mb-disk2048mb-120sec`
- Memory: 2048MB
- Timeout: 120 seconds
- Region: eu-west-3

**What it does:**

1. Receives your render request
2. Downloads your code from S3
3. Spawns multiple Lambda instances to render frames in parallel
4. Combines frames into final MP4 video
5. Uploads result to S3
6. Sends webhook when done

**Cost:** ~$0.048 per render (much cheaper than running a server 24/7)

---

### 2. Remotion Site (The Instructions)

**File:** `scripts/deploy-remotion-site.ts`

**What it is:** Your bundled video composition code hosted on S3

**Bucket:** `remotionlambda-euwest3-x1kx4pjn4s`
**URL:** `https://remotionlambda-euwest3-x1kx4pjn4s.s3.eu-west-3.amazonaws.com/sites/kimu-video-renderer/index.html`

**What it contains:**

- `app/videorender/index.ts` - Entry point
- `app/videorender/Composition.tsx` - Defines TimelineComposition
- `app/video-compositions/VideoPlayer.tsx` - Rendering logic
- All dependencies (React, Remotion, transitions)

**Why S3?**

- Lambda needs to download your code from somewhere
- S3 is fast and reliable
- Lambda caches it for faster subsequent renders

**Can it render different videos?**
YES! Your composition accepts input props:

```typescript
{
  timelineData: [...],      // Different scenes/scrubbers
  compositionWidth: 1920,   // Any dimensions
  compositionHeight: 1080,
  durationInFrames: 900,
  variableValues: {...}     // Different text/media
}
```

Send different props = Get different videos!

---

## What is useRenderer?

**File:** `app/hooks/useRenderer.ts`

**Purpose:** React hook that handles video rendering from the editor UI

**Current Behavior (OLD - Local Server):**

```typescript
User clicks "Render" button
  ↓
useRenderer.handleRenderVideo() is called
  ↓
Sends POST to http://localhost:8000/render
  ↓
Waits for video blob (synchronous)
  ↓
Downloads video immediately
```

**Future Behavior (NEW - Lambda):**

```typescript
User clicks "Render" button
  ↓
useRenderer.handleRenderVideo() is called
  ↓
Sends POST to /api/render (Lambda)
  ↓
Gets back renderId
  ↓
Polls GET /api/render?renderId=X every 2 seconds
  ↓
Shows progress: 0% → 25% → 50% → 75% → 100%
  ↓
Downloads video from S3 URL when done
```

**Why the change?**

- Lambda rendering is **asynchronous** (takes time)
- Can't block the browser waiting for response
- Need to poll for progress
- Better UX with progress bar

**What it does:**

1. Collects timeline data from editor
2. Calculates composition dimensions
3. Sends render request to API
4. Polls for progress
5. Downloads finished video

---

## Complete Flow Diagram

### Current (Local Server)

```
Editor → useRenderer → Local Server (port 8000) → Video Blob → Download
         (synchronous, blocks browser)
```

### New (Lambda - Being Implemented)

```
Editor → useRenderer → POST /api/render → Lambda Service
                                            ↓
                                    renderMediaOnLambda()
                                            ↓
                                       AWS Lambda
                                            ↓
                                    Downloads S3 site
                                            ↓
                                    Renders frames (parallel)
                                            ↓
                                    Uploads to S3
                                            ↓
                                    Sends webhook
         ↑                                  ↓
         Poll every 2s ← GET /api/render ← Progress updates
         ↓
    Show progress bar (0-100%)
         ↓
    Download from S3 URL when done
```

---

## Security TODO

**Current Issue:** S3 bucket allows public listing

**TODO Added:** In `scripts/deploy-remotion-site.ts`:

```typescript
// TODO: Implement bucket security - see https://remotion.dev/docs/lambda/bucket-security
// Current bucket allows public listing which is a security risk
```

**What needs to be done:**

- Configure bucket policy to prevent public listing
- Keep files publicly readable (Lambda needs access)
- But hide directory listing

---

## Cost Comparison

### Lambda (Pay-per-use)

- $0.048 per render
- 1000 renders/month = $48
- Only pay when rendering

### Dedicated Server (Always running)

- EC2 t3.medium = $30/month
- Runs 24/7 even when idle
- Break-even at ~625 renders/month

**Lambda wins if:** You render less than 625 videos/month
**Server wins if:** You render more than 625 videos/month

---

## Current Status

### ✅ Completed (Phases 1-2)

- Lambda function deployed
- S3 site deployed
- Lambda render service created
- API endpoints created
- Webhook handler created

### ⏳ Next (Phase 3)

- Update useRenderer to call Lambda API
- Add progress polling
- Update UI for async rendering

---

## Key Takeaways

1. **Lambda Function** = Compute power (renders videos)
2. **S3 Site** = Your code (tells Lambda HOW to render)
3. **useRenderer** = React hook (handles rendering from UI)
4. **Yes, it can render any template!** Just send different input props
5. **Security TODO** = Fix S3 bucket public listing
