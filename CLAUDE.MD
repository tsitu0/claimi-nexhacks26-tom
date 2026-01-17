# Claimly: AI-Powered Settlement Discovery & Autofill

## Project Overview
Claimly is an "agentic" platform for finding and filing class action settlements. It consists of a web dashboard and a Chrome Extension (Autofill Agent).

## Core Agent Architecture
1. **Discovery Agent**: Scours administrator sites to find new settlement URLs.
2. **Parsing Agent**: Converts legal text into structured JSON eligibility rules (dates, locations, products).
3. **Profile Interview Agent**: Asks the user minimal questions to fill in demographic/purchase gaps.
4. **Evidence Agent**: Scans user-uploaded documents (receipts, emails) to verify eligibility.
5. **Autofill Agent (Current Task)**: A browser extension that consumes a "Claim Packet" and populates official settlement forms.

## Autofill Agent Strategy (Advanced Implementation)

### Input
- A JSON "Claim Packet" containing user data and inferred case answers.

### Tiered Decision Policy
- **Tier 0 (Deterministic)**: Autocomplete tokens + input type exact matches (confidence: 1.0)
- **Tier 1 (Exact)**: Regex patterns on id/name attributes (confidence: 0.8-0.9)
- **Tier 2 (Fuzzy)**: Fuse.js Extended Search + MiniSearch BM25 ranking (confidence: 0.6-0.8)
- **Tier 3 (Keyword)**: Strict keyword fallback with negative evidence (confidence: 0.5-0.6)

### Key Techniques
1. **Accessible Name Computation**: aria-labelledby > aria-label > label > placeholder (W3C ARIA spec)
2. **HTML Semantics as Signals**: type, autocomplete, inputmode, min/max constraints
3. **Fuse.js Extended Search**: useExtendedSearch, threshold 0.25, ignoreLocation
4. **MiniSearch BM25**: For long label text ranking
5. **Schema Validators**: libphonenumber-js for phones, regex for emails/zips
6. **Negative Evidence System**: Per-field blacklists + question detection
7. **Composite Scoring**: 70% text + 20% schema bonus + 10% DOM proximity
8. **Text Normalization**: Diacritics removal, camelCase split, synonyms, stop words

### UI
- ✅ Green: Successfully filled (high confidence)
- ⚠️ Yellow dashed: Filled but uncertain (needs review)
- 🟡 Yellow solid: Required but not matched (skipped)
- **Review UI**: Click uncertain fields to Accept/Reject

## Autofill Refinement Rules (Implemented)
- **Context Scraping**: Extracts full label + aria-describedby + nearby hint elements
- **Strict Name Matching**: Blacklists "Department", "Company", "Organization", etc.
- **Numeric Triage**: "How many" + min/max constraints block phone matching
- **Validation Step**: libphonenumber for phones, email regex, date parsing
- **Confidence Threshold**: Fields below 75% confidence flagged for review

## Tech Stack
- **Dashboard**: Next.js 14/15, Tailwind, shadcn/ui.
- **Backend**: Supabase (Postgres, Auth, Storage).
- **Extension**: Chrome Manifest V3 (MV3), TypeScript.
- **Models**: Vercel AI SDK for agentic orchestration.

## Guiding Principle
"Human-in-the-loop": Automate the tedious work, but never auto-submit. Always let the user review.