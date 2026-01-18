/**
 * Settlement data types for the Claimi system
 */

export interface LocationRule {
  include: string[];
  exclude: string[];
}

export interface DateRange {
  start: string;
  end: string;
}

export interface ProofRequirements {
  required: boolean;
  examples: string[];
}

export interface EligibilityRules {
  locations: LocationRule;
  date_range: DateRange;
  requirements: string[];
  proof: ProofRequirements;
}

export interface Citation {
  quote: string;
  source_url: string;
  section: string;
}

/**
 * Form field information for claim forms
 */
export interface ClaimFormField {
  type: string;
  name: string;
  label?: string;
  required: boolean;
  options?: string[];
}

/**
 * Claim form information
 */
export interface ClaimFormInfo {
  form_url: string;
  is_valid: boolean;
  field_count: number;
  fields?: ClaimFormField[];
  validation_reason?: string;
}

export interface SettlementData {
  id?: string;
  title: string;
  provider: string;  // Defendant/company name
  case_name: string | null;  // Official case name (e.g., "Gelasio v. Educative Inc.")
  description: string;  // Short description of what the settlement is about
  settlement_amount: string | null;  // Total settlement amount if mentioned
  deadline: string | null;
  eligibility_rules: EligibilityRules;
  citations: Citation[];
  claim_url: string;  // URL to submit claim form
  source_url: string;  // URL where settlement info was found
  claim_form_info?: ClaimFormInfo;  // Validated form information
  has_valid_form: boolean;  // Whether this has a fillable claim form
  raw_content?: string;
  status: 'discovered' | 'parsed' | 'verified' | 'expired' | 'no_form';
  created_at?: string;
  updated_at?: string;
}

export interface ScrapedPage {
  url: string;
  title: string;
  html: string;
  text: string;
  sections: PageSection[];
}

export interface PageSection {
  heading: string;
  content: string;
  html: string;
}

export interface DiscoveryResult {
  success: boolean;
  settlement?: SettlementData;
  error?: string;
  raw_scraped?: ScrapedPage;
}

