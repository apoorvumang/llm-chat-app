# LLM Chat App

A feature-rich chat interface for LLMs with integrated terminal access, web search, and multi-endpoint support. Built with Next.js and deployable to Fly.io.

![Mercury Chat](public/logo.svg)

## Features

- **Multi-Endpoint Support** - Configure server endpoints (shared, read-only) and personal endpoints (stored locally)
- **Terminal Integration** - Let the LLM execute commands on remote servers via the llm-terminal binary
- **Web Search** - Toggle web search capability powered by Exa API
- **Streaming Responses** - Real-time token streaming with metrics (tok/s, latency)
- **Message Editing** - Edit and rerun previous messages
- **Chat Management** - Multiple chat sessions with auto-generated titles
- **Persistent Storage** - Chats and user endpoints stored in IndexedDB, server settings synced globally

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/apoorvumang/llm-chat-app
cd llm-chat-app
npm install
```

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Configuration

Configure LLM endpoints in the Settings modal (⚙️ icon):
- **Server Endpoints** - Defined in `server-settings.json`, shared and read-only
- **My Endpoints** - Personal endpoints stored in your browser's IndexedDB

Each endpoint requires:
- **Name** - Display name
- **Base URL** - API endpoint (e.g., `https://api.openai.com/v1`)
- **Model Name** - Model identifier
- **API Key** - Your API key
- **Extra Params** - Optional parameters (e.g., `realtime: true`)

## Terminal Integration

The app supports AI-assisted terminal access on remote servers (GPU nodes, VMs, HPC clusters).

```
Remote Server                    Relay Server                     Browser
┌──────────────┐                ┌─────────────────┐            ┌─────────┐
│ llm-terminal │ ──outbound────▶│ your-app.fly.dev│◀───────────│ Browser │
│   (binary)   │   WebSocket    │                 │            │         │
└──────────────┘                └─────────────────┘            └─────────┘
```

### Setup

Download and run the `llm-terminal` binary on any machine you want to connect to. Get it from:

**[https://github.com/apoorvumang/llm-terminal](https://github.com/apoorvumang/llm-terminal)**

The binary will output a URL like `https://your-app.fly.dev/t/k7x9m2` - open this in your browser to start using the terminal with your LLM.

## Web Search

Toggle web search with the 🔍 button in the chat input. When enabled, the LLM can search the web using the Exa API.

**Server-side setup:**
Set the `EXA_API_KEY` environment variable with your [Exa](https://exa.ai) API key.

## Deployment

### Deploy to Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login and deploy
fly auth login
fly launch  # First time only
fly deploy
```

**Required Secrets:**
```bash
fly secrets set BASE_URL=https://your-app.fly.dev
fly secrets set EXA_API_KEY=your-exa-api-key        # For web search
```


## Architecture

### Frontend (`src/app/`, `src/components/`)
- Next.js App Router with React
- xterm.js for terminal rendering
- IndexedDB for local chat and user endpoint persistence

### Backend
- **Chat API** (`src/app/api/chat/`) - Proxies to configured LLM endpoints with streaming
- **Search API** (`src/app/api/search/`) - Exa web search integration
- **Settings API** (`src/app/api/settings/`) - Server-side settings (read-only endpoints)
- **Title API** (`src/app/api/title/`) - Auto-generates chat titles
- **Relay Server** (`src/server/relay-server.mjs`) - Routes terminal I/O between llm-terminal binaries and browsers

## Security Considerations

> ⚠️ **Warning**: The terminal bridge allows the LLM to execute arbitrary commands on the connected machine. Only run it in trusted environments.

- Remote connections use unique session IDs
- Commands execute as the user running the bridge
- 30-second timeout for command execution
- Sessions expire after 24 hours of inactivity

## Development

```bash
npm run dev       # Start dev server
npm run relay     # Start relay server (for production)
npm run build     # Production build
npm test          # Run tests
npm run lint      # Lint code
```

## License

MIT
