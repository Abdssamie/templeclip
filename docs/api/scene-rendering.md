# Scene Rendering API

This document describes how to use the Kimu API to render videos with scene templates and variables.

## Authentication

All API endpoints require authentication. Include your session cookie in the request headers.

## Endpoints

### 1. List Scene Templates

Get all scene templates in a project.

**Request:**

```http
GET /api/scenes/:projectId
Cookie: better-auth.session_token=...
```

**Response:**

```json
{
  "scenes": [
    {
      "id": "scene-uuid",
      "name": "Intro Scene",
      "timeline": { ... },
      "variableSchema": [
        { "name": "headline", "defaultValue": "Default Headline" }
      ],
      "elasticityRules": []
    }
  ]
}
```

### 2. Export Single Scene

Get a specific scene template by ID.

**Request:**

```http
GET /api/scenes/:projectId/:sceneId
Cookie: better-auth.session_token=...
```

**Response:**

```json
{
  "scene": {
    "id": "scene-uuid",
    "name": "Intro Scene",
    "timeline": { ... },
    "variableSchema": [
      { "name": "headline", "defaultValue": "Default Headline" }
    ],
    "elasticityRules": []
  }
}
```

### 3. Render Video with Scene

Render a video using a scene template with custom variables.

**Request:**

```http
POST /render
Content-Type: application/json

{
  "timelineData": [ ... ],
  "compositionWidth": 1920,
  "compositionHeight": 1080,
  "variableValues": {
    "headline": "My Custom Headline",
    "background_video": "https://example.com/video.mp4"
  },
  "scenes": [ ... ],
  "applyElasticity": true
}
```

**Response:**
Binary MP4 video file

## Example: Render Video with Variables

```bash
# 1. Get scene template
curl -X GET "http://localhost:5173/api/scenes/project-id/scene-id" \
  -H "Cookie: better-auth.session_token=YOUR_TOKEN" \
  -o scene.json

# 2. Render video with custom variables
curl -X POST "http://localhost:8000/render" \
  -H "Content-Type: application/json" \
  -d '{
    "timelineData": [...],
    "compositionWidth": 1920,
    "compositionHeight": 108riableValues": {
      "headline": "Breaking News!",
      "subtitle": "This is a test"
    },
    "scenes": [...],
    "applyElasticity": true
  }' \
  --output rendered-video.mp4
```

## Elasticity Rules

Elasticity rules allow video/audio scrubbers to automatically adjust their duration based on actual media length:

- **stretch**: Scrubber expands to match actual media duration (accounting for trimming)
- **fixed**: Scrubber keeps its original duration from the timeline

Elasticity is **only applied during server-side rendering**, not in the UI editor.

To disable elasticity, set `applyElasticity: false` in the render request.

### How Elasticity Works

1. During rendering, the server checks each scrubber for elasticity rules
2. For scrubbers with `strategy: "stretch"`, the duration is recalculated based on actual media duration
3. Subsequent scrubbers are shifted forward to prevent overlap
4. The total composition duration is recalculated after applying elasticity

### Example Elasticity Rule

```json
{
  "elasticityRules": [
    {
      "scrubberId": "scrubber-uuid",
      "strategy": "stretch"
    }
  ]
}
```

## Variable Substitution

Variables in text content use the `{{variableName}}` syntax. During rendering, these are replaced with values from `variableValues`.

**Example:**

Text content: `"Welcome to {{headline}}!"`

Variable values: `{ "headline": "My Video" }`

Result: `"Welcome to My Video!"`

## Error Responses

All endpoints return JSON error responses:

```json
{
  "error": "Error message description"
}
```

Common status codes:

- `400`: Bad request (missing required fields)
- `401`: Unauthorized (invalid or missing authentication)
- `404`: Not found (project or scene doesn't exist)
- `500`: Internal server error
