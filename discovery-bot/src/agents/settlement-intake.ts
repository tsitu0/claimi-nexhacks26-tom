import OpenAI from 'openai';
import { 
  SettlementData, 
  ScrapedPage, 
  DiscoveryResult,
  EligibilityRules,
  Citation,
  ClaimFormInfo
} from '../types/settlement';
import { 
  fetchCasePage, 
  extractRelevantSections, 
  findSettlementPatterns,
  findClaimFormUrl 
} from '../tools/scraper';
import { 
  validateClaimForm, 
  extractClaimFormUrl, 
  hasValidClaimForm,
  isKnownFormDomain 
} from '../tools/form-validator';
import { storeSettlement, settlementExists } from '../lib/supabase';

/**
 * OpenAI client for LLM parsing
 */
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
 * System prompt for the Settlement Intake Agent
 * LEGAL PRECISION: This has legal implications - preserve exact wording
 */
const SYSTEM_PROMPT = `You are a Settlement Intake Agent for a legal claims system. Your job is to extract structured eligibility information from settlement pages.

⚠️ CRITICAL LEGAL REQUIREMENTS:
- NEVER paraphrase or reword legal text. Use EXACT quotes from the source.
- This data has legal implications. Accuracy is paramount.
- When in doubt, quote directly rather than summarize.
- Ignore irrelevant content (comments, ads, navigation, unrelated articles).

You MUST output valid JSON matching this exact structure:
{
  "title": "Exact settlement title as written on page",
  "provider": "Defendant/company name (e.g., 'Educative Inc.', 'Apple', 'T-Mobile')",
  "case_name": "Official case name exactly as written (e.g., 'Gelasio v. Educative Inc., Case No. 25-CIV-02720') or null",
  "description": "One sentence describing what the settlement is about, using original wording where possible",
  "settlement_amount": "Total settlement amount as stated (e.g., '$625,000') or null",
  "deadline": "CLAIM DEADLINE in YYYY-MM-DD format (look for 'Deadline to file a claim', 'Claim Form Deadline', 'File by' dates)",
  "eligibility_rules": {
    "locations": {
      "include": ["Exact locations as stated - e.g., 'California', 'United States'"],
      "exclude": ["Any explicitly excluded locations"]
    },
    "date_range": {
      "start": "YYYY-MM-DD - the START of the eligible period",
      "end": "YYYY-MM-DD - the END of the eligible period"
    },
    "requirements": [
      "BREAK DOWN each requirement into atomic, specific statements",
      "Each requirement should be ONE clear condition",
      "Use exact legal wording from the source",
      "Example: Instead of 'bought product and didn't get refund', use:",
      "  - 'Purchased [Product X] during the class period'",
      "  - 'Did not receive a full refund'"
    ],
    "proof": {
      "required": true/false,
      "optional": true/false,
      "examples": ["List each type of acceptable documentation separately"]
    }
  },
  "citations": [
    {
      "quote": "EXACT verbatim quote from the source - DO NOT paraphrase",
      "source_url": "URL",
      "section": "Section heading where this was found"
    }
  ],
  "claim_url": "EXTERNAL URL to file the claim (see rules below)",
  "settlement_website": "Settlement administrator website if mentioned (e.g., 'Supplements-Settlement.com')"
}

EXTRACTION RULES:
1. PRESERVE EXACT WORDING - Copy legal text verbatim for citations and requirements
2. BREAK DOWN REQUIREMENTS - Split compound requirements into atomic conditions:
   BAD:  "California residents who enrolled and were charged renewal fees"
   GOOD: ["Must be a California resident", "Must have enrolled in an auto-renewing subscription", "Must have been charged one or more automatic renewal fees"]
3. CAPTURE ALL KEY DETAILS - Title, provider/defendant, case name, amounts, deadlines
4. IGNORE NOISE - Skip user comments, newsletter signups, related articles, ads
5. MULTIPLE CITATIONS - Include a citation for EACH major eligibility requirement
6. DATE PRECISION - Convert all dates to YYYY-MM-DD format (e.g., "March 11, 2026" → "2026-03-11", "02/13/2026" → "2026-02-13")
7. PROOF SPECIFICITY - List each proof type separately (receipt, screenshot, email, etc.)
8. If location not specified, assume "United States" for include
9. Return ONLY valid JSON, no markdown or explanations

⚠️ DEADLINE EXTRACTION (CRITICAL):
- Look for "Deadline to file a claim:", "Claim Form Deadline:", "Claims must be filed by:"
- The deadline is the last date users can submit claims, NOT the final hearing date
- Convert MM/DD/YYYY or "Month DD, YYYY" to YYYY-MM-DD format
- Example: "Deadline to file a claim: 02/13/2026" → deadline: "2026-02-13"

⚠️ CLAIM URL RULES (CRITICAL):
- Look for "CLICK HERE TO FILE A CLAIM" or similar links - extract the DESTINATION URL
- Look for "Settlement Website:" mentions (e.g., "Settlement Website: Supplements-Settlement.com")
- The claim_url should be an EXTERNAL site (not the news article URL)
- Common patterns: xyz-settlement.com, xyzclassaction.com, simpluris.com/xyz
- If you find a settlement website name, format it as: https://www.{website}
- NEVER return the source article URL as the claim_url`;

/**
 * Parse settlement page content using LLM
 */
async function parseWithLLM(scrapedPage: ScrapedPage): Promise<{
  title: string;
  provider: string;
  case_name: string | null;
  description: string;
  settlement_amount: string | null;
  deadline: string | null;
  eligibility_rules: EligibilityRules;
  citations: Citation[];
  claim_url: string | null;
  settlement_website: string | null;
}> {
  const ai = getOpenAI();

  // Prepare content for LLM - combine relevant sections
  const patterns = findSettlementPatterns(scrapedPage);
  
  let contentForLLM = `Page Title: ${scrapedPage.title}\n\nURL: ${scrapedPage.url}\n\n`;
  
  // Add identified sections first (most relevant)
  if (patterns.eligibilitySection) {
    contentForLLM += `## ELIGIBILITY SECTION ##\n${patterns.eligibilitySection.content}\n\n`;
  }
  if (patterns.deadlineSection) {
    contentForLLM += `## DEADLINE SECTION ##\n${patterns.deadlineSection.content}\n\n`;
  }
  if (patterns.proofSection) {
    contentForLLM += `## PROOF/DOCUMENTATION SECTION ##\n${patterns.proofSection.content}\n\n`;
  }
  if (patterns.claimSection) {
    contentForLLM += `## CLAIM FILING SECTION ##\n${patterns.claimSection.content}\n\n`;
  }
  
  // Add remaining sections
  contentForLLM += `## ALL SECTIONS ##\n`;
  for (const section of scrapedPage.sections) {
    contentForLLM += `### ${section.heading} ###\n${section.content}\n\n`;
  }

  // Truncate if too long (keep under ~12k tokens for context)
  const maxChars = 40000;
  if (contentForLLM.length > maxChars) {
    contentForLLM = contentForLLM.slice(0, maxChars) + '\n\n[Content truncated...]';
  }

  const response = await ai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { 
        role: 'user', 
        content: `Analyze this settlement page and extract eligibility information:\n\n${contentForLLM}` 
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1, // Low temperature for consistency
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from LLM');
  }

  try {
    const parsed = JSON.parse(content);
    
    // Validate and provide defaults - preserve exact legal wording
    return {
      title: parsed.title || scrapedPage.title,
      provider: parsed.provider || 'Unknown',
      case_name: parsed.case_name || null,
      description: parsed.description || '',
      settlement_amount: parsed.settlement_amount || null,
      deadline: parsed.deadline || null,
      eligibility_rules: {
        locations: {
          include: parsed.eligibility_rules?.locations?.include || ['United States'],
          exclude: parsed.eligibility_rules?.locations?.exclude || [],
        },
        date_range: {
          start: parsed.eligibility_rules?.date_range?.start || null,
          end: parsed.eligibility_rules?.date_range?.end || null,
        },
        requirements: parsed.eligibility_rules?.requirements || [],
        proof: {
          required: parsed.eligibility_rules?.proof?.required ?? false,
          examples: parsed.eligibility_rules?.proof?.examples || [],
        },
      },
      citations: (parsed.citations || []).map((c: any) => ({
        quote: c.quote || '',
        source_url: c.source_url || scrapedPage.url,
        section: c.section || 'Unknown',
      })),
      claim_url: parsed.claim_url || null,
      settlement_website: parsed.settlement_website || null,
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', content);
    throw new Error('Invalid JSON from LLM');
  }
}

/**
 * Settlement Intake Agent
 * Takes a settlement URL, scrapes it, parses eligibility, and stores in Supabase
 * @param url - Settlement page URL to discover
 * @param force - If true, re-discover even if settlement already exists in database
 */
export async function discoverSettlement(url: string, force: boolean = false): Promise<DiscoveryResult> {
  console.log(`🔍 Discovering settlement: ${url}${force ? ' (force mode)' : ''}`);

  try {
    // Check if already processed (skip if force mode)
    if (!force) {
      const exists = await settlementExists(url);
      if (exists) {
        console.log(`⏭️  Settlement already exists: ${url}`);
        return {
          success: false,
          error: 'Settlement already exists in database',
        };
      }
    } else {
      console.log(`⚠️  Force mode: will overwrite existing settlement if found`);
    }

    // Step 1: Fetch the page
    console.log('📥 Fetching page...');
    const { html } = await fetchCasePage(url);

    // Step 2: Extract relevant sections
    console.log('🔎 Extracting sections...');
    const scrapedPage = extractRelevantSections(html, url);

    if (scrapedPage.sections.length === 0 && scrapedPage.text.length < 100) {
      return {
        success: false,
        error: 'Could not extract meaningful content from page',
        raw_scraped: scrapedPage,
      };
    }

    // Step 3: Parse with LLM
    console.log('🤖 Parsing with LLM...');
    const parsed = await parseWithLLM(scrapedPage);

    // Step 4: Extract and find claim form URLs
    console.log('🔗 Finding claim form URL...');
    let claimUrl = parsed.claim_url;
    
    // If LLM found a settlement website, use it
    if (!claimUrl && parsed.settlement_website) {
      const website = parsed.settlement_website.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
      claimUrl = `https://www.${website}`;
      console.log(`📍 Using settlement website: ${claimUrl}`);
    }
    
    // Try scraper method to find claim URL
    if (!claimUrl) {
      claimUrl = findClaimFormUrl(html, url);
    }
    
    // Try form URL extraction as fallback
    if (!claimUrl) {
      const extracted = await extractClaimFormUrl(html, url);
      claimUrl = extracted.claimUrl;
    }
    
    // Filter out the source URL - claim URL must be EXTERNAL
    if (claimUrl && claimUrl.includes('topclassactions.com')) {
      console.log('⚠️  Filtering out internal URL, looking for external...');
      const scraperUrl = findClaimFormUrl(html, url);
      if (scraperUrl && !scraperUrl.includes('topclassactions.com')) {
        claimUrl = scraperUrl;
      } else {
        claimUrl = null;
      }
    }

    // Step 5: Validate the claim form
    console.log('📋 Validating claim form...');
    let hasValidForm = false;
    let claimFormInfo: ClaimFormInfo | undefined;

    if (claimUrl) {
      // Check if it's a known valid domain first (fast path)
      if (isKnownFormDomain(claimUrl)) {
        hasValidForm = true;
        claimFormInfo = {
          form_url: claimUrl,
          is_valid: true,
          field_count: 0,
          validation_reason: 'Known settlement administrator domain',
        };
        console.log('✅ Known settlement form domain');
      } else {
        // Validate the actual form
        const validation = await validateClaimForm(claimUrl);
        hasValidForm = validation.isValid;
        claimFormInfo = {
          form_url: claimUrl,
          is_valid: validation.isValid,
          field_count: validation.fieldCount,
          fields: validation.fields,
          validation_reason: validation.reason,
        };
        
        if (hasValidForm) {
          console.log(`✅ Valid claim form with ${validation.fieldCount} fields`);
        } else {
          console.log(`⚠️  Form validation failed: ${validation.reason}`);
        }
      }
    } else {
      console.log('⚠️  No claim form URL found');
    }

    // Step 6: Validate required fields (skip incomplete settlements)
    console.log('✅ Validating required fields...');
    const missingFields: string[] = [];
    
    // Required: Title
    if (!parsed.title || parsed.title.trim() === '' || parsed.title === 'No Title') {
      missingFields.push('title');
    }
    
    // Required: Deadline (must know when to file)
    if (!parsed.deadline) {
      missingFields.push('deadline');
    }
    
    // Required: Claim URL (must be able to file)
    if (!claimUrl || claimUrl.trim() === '') {
      missingFields.push('claim_url');
    }
    
    // Required: At least one eligibility requirement
    if (!parsed.eligibility_rules?.requirements || parsed.eligibility_rules.requirements.length === 0) {
      missingFields.push('eligibility_requirements');
    }
    
    // Required: At least one citation (for trustworthiness)
    if (!parsed.citations || parsed.citations.length === 0) {
      missingFields.push('citations');
    }
    
    // Required: Provider/defendant name
    if (!parsed.provider || parsed.provider === 'Unknown' || parsed.provider.trim() === '') {
      missingFields.push('provider');
    }
    
    // Reject if any required fields are missing
    if (missingFields.length > 0) {
      console.log(`❌ Skipping incomplete settlement: ${parsed.title || url}`);
      console.log(`   Missing fields: ${missingFields.join(', ')}`);
      return {
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        raw_scraped: scrapedPage,
      };
    }

    // Step 7: Check deadline validity (skip expired settlements)
    if (parsed.deadline) {
      const deadlineDate = new Date(parsed.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (deadlineDate < today) {
        console.log(`⏰ Skipping expired settlement: ${parsed.title} (deadline: ${parsed.deadline})`);
        return {
          success: false,
          error: `Settlement deadline has expired: ${parsed.deadline}`,
          raw_scraped: scrapedPage,
        };
      }
      
      // Calculate days remaining
      const daysRemaining = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`📅 Deadline: ${parsed.deadline} (${daysRemaining} days remaining)`);
    }

    // Step 9: Build settlement data with all extracted fields
    const settlement: SettlementData = {
      title: parsed.title,
      provider: parsed.provider,
      case_name: parsed.case_name,
      description: parsed.description,
      settlement_amount: parsed.settlement_amount,
      deadline: parsed.deadline,
      eligibility_rules: parsed.eligibility_rules,
      citations: parsed.citations,
      claim_url: claimUrl!, // We've validated this exists above
      source_url: url,
      claim_form_info: claimFormInfo,
      has_valid_form: hasValidForm,
      raw_content: scrapedPage.text.slice(0, 50000), // Store truncated raw content
      status: hasValidForm ? 'discovered' : 'no_form',
    };

    // Step 10: Store in Supabase
    console.log('💾 Storing in Supabase...');
    const stored = await storeSettlement(settlement);
    
    if (stored) {
      settlement.id = stored.id;
    }

    const formStatus = hasValidForm ? 'with valid form' : '(form not validated)';
    console.log(`✅ Settlement discovered ${formStatus}: ${settlement.title}`);

    return {
      success: true,
      settlement,
      raw_scraped: scrapedPage,
    };

  } catch (error: any) {
    console.error('❌ Discovery failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Batch discover multiple settlement URLs
 */
export async function discoverSettlements(urls: string[]): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = [];
  
  for (const url of urls) {
    const result = await discoverSettlement(url);
    results.push(result);
    
    // Small delay between requests to be polite
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Re-parse an existing settlement with updated LLM
 */
export async function reparseSettlement(settlementId: string): Promise<DiscoveryResult> {
  // This would fetch the raw_content from DB and re-run LLM parsing
  // Useful for updating old entries with improved prompts
  throw new Error('Not implemented yet');
}

