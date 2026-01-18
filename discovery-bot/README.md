# Claimi - Settlement Discovery Agent

An edge-deployed multi-agent system that discovers settlements, parses eligibility into verifiable rules with citations, and stores structured data for downstream processing.

## 🎯 What It Does

**Agent 1: Settlement Intake Agent (Parser)**

Takes a settlement URL and produces structured eligibility data:

```json
{
  "title": "Example Class Action Settlement",
  "deadline": "2026-03-01",
  "eligibility_rules": {
    "locations": {"include": ["US"], "exclude": ["CA"]},
    "date_range": {"start": "2021-01-01", "end": "2023-12-31"},
    "requirements": ["had an account", "purchased product X"],
    "proof": {"required": false, "examples": ["receipt", "account screenshot"]}
  },
  "citations": [
    {"quote": "Eligible if you purchased...", "source_url": "...", "section": "Eligibility"}
  ],
  "claim_url": "https://..."
}
```

✅ **Citations** → Judges and users love seeing exact source quotes for trust

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
# Supabase (required for storage)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# OpenAI (required for LLM parsing)
OPENAI_API_KEY=sk-your-openai-key

# LeanMCP (for deployment)
LEANMCP_API_KEY=leanmcp_your-key

# Optional
PORT=3000
```

### 3. Set Up Supabase Database

Run this SQL in your Supabase SQL Editor:

```sql
-- Create settlements table
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  deadline DATE,
  eligibility_rules JSONB NOT NULL DEFAULT '{}',
  citations JSONB NOT NULL DEFAULT '[]',
  claim_url TEXT,
  source_url TEXT UNIQUE NOT NULL,
  raw_content TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_settlements_source_url ON settlements(source_url);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_deadline ON settlements(deadline);

-- Enable RLS
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust for your auth needs)
CREATE POLICY "Allow all operations" ON settlements
  FOR ALL USING (true) WITH CHECK (true);
```

### 4. Run the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /mcp` | MCP protocol endpoint (JSON-RPC 2.0) |
| `GET /health` | Health check |
| `GET /` | Dashboard |

## 🔧 Available Tools

### `discoverSettlement`
Scrape and parse a single settlement URL.

**Input:**
```json
{
  "url": "https://www.settlementwebsite.com/case-page"
}
```

**Output:**
```json
{
  "success": true,
  "settlement": {
    "title": "...",
    "deadline": "2026-03-01",
    "eligibility_rules": {...},
    "citations": [...],
    "claim_url": "..."
  }
}
```

### `batchDiscoverSettlements`
Process multiple settlement URLs at once.

**Input:**
```json
{
  "urls": [
    "https://settlement1.com",
    "https://settlement2.com"
  ]
}
```

### `getSettlement`
Retrieve a settlement by ID.

**Input:**
```json
{
  "id": "uuid-here"
}
```

### `listSettlements`
List all discovered settlements.

**Input:**
```json
{
  "status": "discovered"  // optional: discovered, parsed, verified, expired
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client (AI Agent)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   LeanMCP Server (:3000)                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │               Discovery Service (MCP)                   ││
│  │  • discoverSettlement                                   ││
│  │  • batchDiscoverSettlements                             ││
│  │  • getSettlement / listSettlements                      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   Web Scraper    │ │   LLM Parser     │ │    Supabase      │
│  (Cheerio/Axios) │ │   (GPT-4o)       │ │   (Storage)      │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## 📁 Project Structure

```
claimi-nexhacks26/
├── src/
│   ├── agents/
│   │   └── settlement-intake.ts   # Main discovery agent
│   ├── tools/
│   │   └── scraper.ts             # Web scraping utilities
│   ├── lib/
│   │   └── supabase.ts            # Supabase client
│   ├── types/
│   │   └── settlement.ts          # TypeScript types
│   ├── config.ts                  # Configuration
│   └── server.ts                  # Main server
├── mcp/
│   └── discovery/
│       └── index.ts               # MCP Discovery Service
├── package.json
└── tsconfig.json
```

## 🔐 Security Notes

- API keys are stored in environment variables
- Never commit `.env` file to version control
- Supabase RLS policies should be configured for production
- Rate limit scraping to be respectful of source sites

## 🚢 Deployment

### Deploy to LeanMCP Platform

```bash
npm run leanmcp:login
npm run leanmcp:deploy
```

### Self-Hosted

Build and deploy the `dist/` folder to any Node.js hosting platform (Vercel, Railway, Fly.io, etc.)

## 🧪 Testing a Settlement URL

```bash
# Start the server
npm run dev

# In another terminal, test with curl
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "discoverSettlement",
      "arguments": {
        "url": "https://www.topclassactions.com/example-settlement"
      }
    },
    "id": 1
  }'
```

## 📚 Resources

- [LeanMCP Documentation](https://docs.leanmcp.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Supabase Docs](https://supabase.com/docs)

## 📝 License

ISC
