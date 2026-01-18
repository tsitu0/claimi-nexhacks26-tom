# Claimi Logic Bot

Parses settlement requirements from the Discovery Bot into **general** vs **specific** categories, generates onboarding questions, and creates proof checklists.

## 🎯 What It Does

Takes structured settlement data and:

1. **Classifies Requirements**
   - **General**: Demographics, location, account ownership - collected during onboarding
   - **Specific**: Purchases, usage, documents - need proof

2. **Generates Onboarding Questions**
   - Yes/no questions to quickly filter eligible users
   - Maps each question to a requirement

3. **Creates Proof Checklists**
   - Actionable items users need to gather
   - Priority levels (high/medium/low)

## 📊 Output Structure

```json
{
  "settlement_id": "uuid",
  "general_requirements": [
    {
      "category": "location",
      "description": "Must be a California resident",
      "is_verifiable": true,
      "verification_method": "self-reported"
    }
  ],
  "specific_requirements": [
    {
      "category": "purchase",
      "description": "Purchased the product during class period",
      "proof_type": "receipt",
      "proof_examples": ["Store receipt", "Online order confirmation"],
      "is_optional": false
    }
  ],
  "onboarding_questions": [
    {
      "question": "Are you a California resident?",
      "answer_type": "yes_no",
      "maps_to_requirement": "location",
      "disqualifying_answer": "no"
    }
  ],
  "proof_checklist": [
    {
      "description": "Proof of purchase",
      "proof_type": "receipt",
      "examples": ["Store receipt", "Credit card statement"],
      "is_required": true,
      "priority": "high"
    }
  ]
}
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd logic-bot
npm install
```

### 2. Set Up Environment

Create a `.env` file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=sk-your-openai-key
PORT=3001
```

### 3. Create Database Table

Run this SQL in Supabase:

```sql
CREATE TABLE IF NOT EXISTS parsed_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID UNIQUE NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  settlement_title TEXT NOT NULL,
  general_requirements JSONB NOT NULL DEFAULT '[]',
  specific_requirements JSONB NOT NULL DEFAULT '[]',
  onboarding_questions JSONB NOT NULL DEFAULT '[]',
  proof_checklist JSONB NOT NULL DEFAULT '[]',
  parsing_confidence DECIMAL(3,2) DEFAULT 0.0,
  parsing_notes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parsed_requirements_settlement_id ON parsed_requirements(settlement_id);
ALTER TABLE parsed_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations" ON parsed_requirements FOR ALL USING (true) WITH CHECK (true);
```

### 4. Run the Server

```bash
npm run dev
```

## 🔧 Available Tools

| Tool | Description |
|------|-------------|
| `parseSettlement` | Parse a single settlement's requirements |
| `parseAllUnparsed` | Process all unparsed settlements |
| `getParsedRequirements` | Get parsed data by settlement ID |
| `listParsed` | List all parsed requirements |
| `getUnparsed` | List settlements awaiting parsing |

## 📁 Project Structure

```
logic-bot/
├── src/
│   ├── agents/
│   │   └── requirement-parser.ts  # LLM classification logic
│   ├── services/
│   │   └── logic.service.ts       # MCP service
│   ├── lib/
│   │   └── supabase.ts            # Database operations
│   ├── types/
│   │   └── index.ts               # TypeScript types
│   ├── config.ts
│   └── server.ts
├── package.json
└── tsconfig.json
```

## 🏗️ Integration with Discovery Bot

```
Discovery Bot (port 3000)     Logic Bot (port 3001)
        │                              │
        │  discovers settlements       │
        │  stores in 'settlements'     │
        │                              │
        └──────────────────────────────┘
                     │
                     ▼
         Logic Bot reads from 'settlements'
         Parses requirements
         Stores in 'parsed_requirements'
         Updates settlement status to 'parsed'
```

## 📝 License

ISC

