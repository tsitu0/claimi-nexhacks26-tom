/**
 * Types for the Logic Bot
 */

/**
 * General requirement - collected during onboarding
 * Examples: age, location, demographics, account ownership
 */
export interface GeneralRequirement {
  id: string;
  category: 'demographic' | 'location' | 'account' | 'timeframe' | 'other';
  description: string;
  original_text: string;
  is_verifiable: boolean;
  verification_method?: string;
}

/**
 * Specific requirement - needs proof or specific user action
 * Examples: purchase receipts, product usage, specific transactions
 */
export interface SpecificRequirement {
  id: string;
  category: 'purchase' | 'usage' | 'transaction' | 'document' | 'action' | 'other';
  description: string;
  original_text: string;
  proof_type: string;
  proof_examples: string[];
  is_optional: boolean;
}

/**
 * Parsed requirements for a settlement
 */
export interface ParsedRequirements {
  id?: string;
  settlement_id: string;
  settlement_title: string;
  general_requirements: GeneralRequirement[];
  specific_requirements: SpecificRequirement[];
  onboarding_questions: OnboardingQuestion[];
  proof_checklist: ProofChecklistItem[];
  parsing_confidence: number;
  parsing_notes: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Question to ask during user onboarding to check general eligibility
 */
export interface OnboardingQuestion {
  id: string;
  question: string;
  answer_type: 'yes_no' | 'date' | 'location' | 'text' | 'number' | 'select';
  options?: string[];
  maps_to_requirement: string;
  disqualifying_answer?: string;
}

/**
 * Item for the proof checklist
 */
export interface ProofChecklistItem {
  id: string;
  description: string;
  proof_type: string;
  examples: string[];
  is_required: boolean;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Settlement data from discovery bot (simplified)
 */
export interface SettlementInput {
  id: string;
  title: string;
  provider: string;
  deadline: string | null;
  eligibility_rules: {
    locations: {
      include: string[];
      exclude: string[];
    };
    date_range: {
      start: string | null;
      end: string | null;
    };
    requirements: string[];
    proof: {
      required: boolean;
      examples: string[];
    };
  };
  citations: {
    quote: string;
    source_url: string;
    section: string;
  }[];
}

/**
 * Result of parsing a settlement
 */
export interface ParseResult {
  success: boolean;
  parsed?: ParsedRequirements;
  error?: string;
}

