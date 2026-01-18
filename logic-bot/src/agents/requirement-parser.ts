import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import {
  SettlementInput,
  ParsedRequirements,
  ParseResult,
  GeneralRequirement,
  SpecificRequirement,
  OnboardingQuestion,
  ProofChecklistItem,
} from '../types';
import { storeParsedRequirements, getSettlementById } from '../lib/supabase';

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY must be set');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * System prompt for requirement classification
 */
const SYSTEM_PROMPT = `You are a Requirements Classification Agent for a legal claims system. Your job is to analyze settlement eligibility requirements and classify them into GENERAL vs SPECIFIC categories.

**GENERAL REQUIREMENTS** - Things collected during generic user onboarding:
- Demographics: age, gender, occupation
- Location: state, country, region of residence  
- Account ownership: "had an account with X", "was a customer of Y"
- Timeframe: "during [date range]", "between [dates]"
- Status: "current/former employee", "subscriber", "member"

**SPECIFIC REQUIREMENTS** - Things that need specific proof or user action:
- Purchase records: receipts, order confirmations, transaction history
- Product usage: used specific product/feature, experienced specific issue
- Documents: contracts signed, notices received, specific communications
- Actions taken: filed complaint, reported issue, requested refund
- Financial impact: amount paid, fees charged, damages incurred

For each requirement, you should also generate:
1. **Onboarding Questions** - Yes/no or simple questions to quickly check general eligibility
2. **Proof Checklist** - What documents/evidence the user needs for specific requirements

Output valid JSON:
{
  "general_requirements": [
    {
      "category": "demographic|location|account|timeframe|other",
      "description": "Clear description of the requirement",
      "original_text": "Exact text from source",
      "is_verifiable": true/false,
      "verification_method": "How to verify (e.g., 'self-reported', 'address check')"
    }
  ],
  "specific_requirements": [
    {
      "category": "purchase|usage|transaction|document|action|other",
      "description": "Clear description",
      "original_text": "Exact text from source",
      "proof_type": "Type of proof needed",
      "proof_examples": ["Example 1", "Example 2"],
      "is_optional": true/false
    }
  ],
  "onboarding_questions": [
    {
      "question": "Simple question to check eligibility",
      "answer_type": "yes_no|date|location|text|number|select",
      "options": ["Option1", "Option2"] // only for select type
      "maps_to_requirement": "Which requirement this checks",
      "disqualifying_answer": "Answer that means user is NOT eligible"
    }
  ],
  "proof_checklist": [
    {
      "description": "What the user needs to provide",
      "proof_type": "receipt|screenshot|email|document|statement|other",
      "examples": ["Specific example 1", "Specific example 2"],
      "is_required": true/false,
      "priority": "high|medium|low"
    }
  ],
  "parsing_confidence": 0.0-1.0,
  "parsing_notes": ["Any notes about ambiguity or interpretation"]
}

RULES:
1. Be precise - each requirement should be ONE clear condition
2. Generate practical onboarding questions that can quickly filter users
3. Proof checklist should have actionable items users can gather
4. Mark confidence lower if requirements are ambiguous
5. Include notes explaining any interpretation decisions`;

/**
 * Parse a settlement's requirements into general vs specific
 */
async function parseWithLLM(settlement: SettlementInput): Promise<{
  general_requirements: Omit<GeneralRequirement, 'id'>[];
  specific_requirements: Omit<SpecificRequirement, 'id'>[];
  onboarding_questions: Omit<OnboardingQuestion, 'id'>[];
  proof_checklist: Omit<ProofChecklistItem, 'id'>[];
  parsing_confidence: number;
  parsing_notes: string[];
}> {
  const ai = getOpenAI();

  // Build input for LLM
  const inputContent = `
Settlement: ${settlement.title}
Provider: ${settlement.provider}
Deadline: ${settlement.deadline || 'Not specified'}

ELIGIBILITY REQUIREMENTS:
${settlement.eligibility_rules.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

LOCATION RULES:
- Include: ${settlement.eligibility_rules.locations.include.join(', ') || 'Not specified'}
- Exclude: ${settlement.eligibility_rules.locations.exclude.join(', ') || 'None'}

DATE RANGE:
- Start: ${settlement.eligibility_rules.date_range.start || 'Not specified'}
- End: ${settlement.eligibility_rules.date_range.end || 'Not specified'}

PROOF REQUIREMENTS:
- Required: ${settlement.eligibility_rules.proof.required ? 'Yes' : 'No'}
- Examples: ${settlement.eligibility_rules.proof.examples.join(', ') || 'None specified'}

CITATIONS (for context):
${settlement.citations.map(c => `"${c.quote}" - ${c.section}`).join('\n')}
`;

  const response = await ai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Classify these settlement requirements:\n\n${inputContent}` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 2500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from LLM');
  }

  try {
    const parsed = JSON.parse(content);
    
    return {
      general_requirements: parsed.general_requirements || [],
      specific_requirements: parsed.specific_requirements || [],
      onboarding_questions: parsed.onboarding_questions || [],
      proof_checklist: parsed.proof_checklist || [],
      parsing_confidence: parsed.parsing_confidence || 0.5,
      parsing_notes: parsed.parsing_notes || [],
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', content);
    throw new Error('Invalid JSON from LLM');
  }
}

/**
 * Generate unique IDs for parsed items
 */
function generateId(): string {
  return uuidv4().slice(0, 8);
}

/**
 * Parse a settlement's requirements
 */
export async function parseSettlementRequirements(settlementId: string): Promise<ParseResult> {
  console.log(`🔍 Parsing requirements for settlement: ${settlementId}`);

  try {
    // Fetch the settlement
    const settlement = await getSettlementById(settlementId);
    if (!settlement) {
      return {
        success: false,
        error: `Settlement not found: ${settlementId}`,
      };
    }

    // Check if there are requirements to parse
    if (!settlement.eligibility_rules?.requirements || settlement.eligibility_rules.requirements.length === 0) {
      return {
        success: false,
        error: 'Settlement has no requirements to parse',
      };
    }

    console.log(`📋 Found ${settlement.eligibility_rules.requirements.length} requirements to classify`);

    // Parse with LLM
    console.log('🤖 Classifying requirements with LLM...');
    const parsed = await parseWithLLM(settlement);

    // Add IDs to all items
    const generalWithIds: GeneralRequirement[] = parsed.general_requirements.map(r => ({
      ...r,
      id: generateId(),
    }));

    const specificWithIds: SpecificRequirement[] = parsed.specific_requirements.map(r => ({
      ...r,
      id: generateId(),
    }));

    const questionsWithIds: OnboardingQuestion[] = parsed.onboarding_questions.map(q => ({
      ...q,
      id: generateId(),
    }));

    const checklistWithIds: ProofChecklistItem[] = parsed.proof_checklist.map(c => ({
      ...c,
      id: generateId(),
    }));

    // Build result
    const result: ParsedRequirements = {
      settlement_id: settlementId,
      settlement_title: settlement.title,
      general_requirements: generalWithIds,
      specific_requirements: specificWithIds,
      onboarding_questions: questionsWithIds,
      proof_checklist: checklistWithIds,
      parsing_confidence: parsed.parsing_confidence,
      parsing_notes: parsed.parsing_notes,
    };

    // Store in Supabase
    console.log('💾 Storing parsed requirements...');
    const stored = await storeParsedRequirements(result);
    
    if (stored) {
      result.id = stored.id;
    }

    console.log(`✅ Parsed: ${generalWithIds.length} general, ${specificWithIds.length} specific requirements`);
    console.log(`   Generated ${questionsWithIds.length} onboarding questions, ${checklistWithIds.length} proof items`);

    return {
      success: true,
      parsed: result,
    };

  } catch (error: any) {
    console.error('❌ Parsing failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Parse all unparsed settlements
 */
export async function parseAllUnparsed(): Promise<{
  total: number;
  success: number;
  failed: number;
  results: ParseResult[];
}> {
  const { getUnparsedSettlements } = await import('../lib/supabase');
  
  console.log('🔍 Finding unparsed settlements...');
  const settlements = await getUnparsedSettlements();
  
  console.log(`📋 Found ${settlements.length} settlements to parse`);
  
  const results: ParseResult[] = [];
  let success = 0;
  let failed = 0;
  
  for (const settlement of settlements) {
    const result = await parseSettlementRequirements(settlement.id);
    results.push(result);
    
    if (result.success) {
      success++;
    } else {
      failed++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return {
    total: settlements.length,
    success,
    failed,
    results,
  };
}

