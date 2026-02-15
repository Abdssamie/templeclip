<br />

<p align="center">
  <img width="300" height="300" alt="TempleClip Logo" src="./public/templeclip-logo.png" />
</p>

<p align="center">
  <strong>TempleClip</strong> - Template-based video creation with variable substitution
</p>

<p align="center">
  <samp>
    Create videos from code templates powered by Remotion
  </samp>
</p>

## 🎯 What is TempleClip?

TempleClip is a template-based video editor that lets you create reusable video compositions with variable substitution. Built on Remotion, it provides a visual timeline editor for creating templates that can be rendered with different content.

## ⚠️ Project Status

**This project is in maintenance mode.** It was built as a learning exercise and proof-of-concept. The codebase has significant technical debt and architectural issues. For production use, consider using Remotion directly with code-based templates.

## ✨ Features

- **Visual Timeline Editor** - Multi-track editing with drag-and-drop
- **Template Variables** - Create reusable compositions with dynamic content
- **Media Library** - Organize videos, images, and audio files
- **Cloud Storage** - R2 integration for asset management
- **Authentication** - Google OAuth via Better Auth
- **Real-time Preview** - See changes as you edit
- **Export** - Render videos with Remotion

## 💻 Development

### 🐳 Docker (Recommended)

**Quick Start:**

```bash
docker compose -f docker-compose.yml \
  -f docker-compose.dev.yml up -d
```

**Ports:**

- Frontend: `5173`
- Backend: `8000`
- FastAPI: `3000`

### 🛠️ Local Development

```bash
# Install dependencies
pnpm install

# Start services
pnpm run dev                                    # Frontend (port 5173)
pnpm dlx tsx app/videorender/videorender.ts     # Backend (port 8000)
uv run backend/main.py                          # FastAPI (port 3000)
```

**Requirements:**

- Node.js 20+
- Python 3.9+
- PostgreSQL
- Redis
- pnpm

## 🚀 Production Deployment

**Docker Compose:**

```bash
docker compose up -d
```

**With Custom Domain:**

```bash
PROD_DOMAIN=yourdomain.com docker compose up -d
```

**Ports:**

- HTTP: `80`
- HTTPS: `443`

## ⚙️ Environment Configuration

Create a `.env` file:

```env
# Domain Configuration
PROD_DOMAIN=yourdomain.com

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/templeclip_db

# Authentication (Google OAuth)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Cloudflare R2 Storage
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=your_bucket_name

# AI Features (Optional)
GEMINI_API_KEY=your_gemini_api_key
```

## 🏗️ Architecture

- **Frontend**: React Router v7 (SSR)
- **Backend**: Node.js + Express
- **Rendering**: Remotion
- **Database**: PostgreSQL
- **Cache**: Redis
- **Storage**: Cloudflare R2
- **Auth**: Better Auth (Google OAuth)

## 📝 Known Issues

- Complex codebase with mixed concerns
- Schema validation issues with optional fields
- Environment detection problems in production
- Docker networking requires manual configuration for some platforms
- No comprehensive test coverage

## 🔄 Alternatives

If you're looking for a simpler solution:

- **Remotion CLI** - Write templates as React components, render via CLI
- **Remotion Lambda** - Serverless rendering at scale
- **Commercial tools** - Canva, CapCut for non-technical users

## ❤️ Contribution

Contributcome, but please note this project is in maintenance mode. Major refactoring would be needed for production use.

## 📜 License

This project is licensed under a dual-license. Refer to [LICENSE](LICENSE.md) for details. The [Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) also applies to the relevant parts of the project.

## 🙏 Acknowledgments

Built with:

- [Remotion](https://remotion.dev) - Video rendering engine
- [React Router](https://reactrouter.com) - SSR framework
- [Better Auth](https://better-auth.com) - Authentication
- [Cloudflare R2](https://cloudflare.com/r2) - Object storage
