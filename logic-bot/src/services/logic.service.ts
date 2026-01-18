import { Tool, Resource, SchemaConstraint, Optional } from "@leanmcp/core";
import { 
  parseSettlementRequirements, 
  parseAllUnparsed 
} from "../agents/requirement-parser";
import { 
  getParsedRequirements, 
  listParsedRequirements,
  getUnparsedSettlements 
} from "../lib/supabase";
import { ParsedRequirements, ParseResult } from "../types";

/**
 * Input for parsing a single settlement
 */
class ParseSettlementInput {
  @SchemaConstraint({
    description: 'UUID of the settlement to parse requirements for',
  })
  settlement_id!: string;
}

/**
 * Input for getting parsed requirements
 */
class GetParsedInput {
  @SchemaConstraint({
    description: 'UUID of the settlement to get parsed requirements for',
  })
  settlement_id!: string;
}

/**
 * Input for parsing all unparsed settlements
 */
class ParseAllInput {
  @Optional()
  @SchemaConstraint({
    description: 'Maximum number of settlements to parse (default: 10)',
    minimum: 1,
    maximum: 50,
  })
  max?: number;
}

/**
 * Logic Bot Service
 * MCP service for parsing settlement requirements into general vs specific
 */
export class LogicService {

  /**
   * Tool: Parse Settlement Requirements
   * Takes a settlement and classifies requirements into general vs specific
   */
  @Tool({
    description: `Parse a settlement's eligibility requirements into general vs specific categories.
    
    GENERAL: Demographics, location, account ownership, timeframes - collected during onboarding
    SPECIFIC: Purchases, usage, documents, actions - need proof
    
    Also generates onboarding questions and proof checklists.`,
    inputClass: ParseSettlementInput,
  })
  async parseSettlement(input: ParseSettlementInput): Promise<ParseResult> {
    return parseSettlementRequirements(input.settlement_id);
  }

  /**
   * Tool: Parse All Unparsed Settlements
   * Process all settlements that haven't been parsed yet
   */
  @Tool({
    description: `Parse all settlements that haven't been processed by logic bot yet.
    Classifies requirements and generates onboarding questions for each.`,
    inputClass: ParseAllInput,
  })
  async parseAllUnparsed(input: ParseAllInput): Promise<{
    total: number;
    success: number;
    failed: number;
    results: ParseResult[];
  }> {
    const result = await parseAllUnparsed();
    
    // Limit results if max is specified
    if (input.max && result.results.length > input.max) {
      return {
        ...result,
        total: input.max,
        results: result.results.slice(0, input.max),
      };
    }
    
    return result;
  }

  /**
   * Tool: Get Parsed Requirements
   * Retrieve parsed requirements for a specific settlement
   */
  @Tool({
    description: 'Get the parsed requirements for a specific settlement by ID',
    inputClass: GetParsedInput,
  })
  async getParsedRequirements(input: GetParsedInput): Promise<{
    found: boolean;
    parsed?: ParsedRequirements;
  }> {
    const parsed = await getParsedRequirements(input.settlement_id);
    return {
      found: !!parsed,
      parsed: parsed || undefined,
    };
  }

  /**
   * Tool: List All Parsed Requirements
   * Get all parsed requirements
   */
  @Tool({
    description: 'List all parsed requirements from all settlements',
  })
  async listParsed(): Promise<{
    count: number;
    parsed: ParsedRequirements[];
  }> {
    const parsed = await listParsedRequirements();
    return {
      count: parsed.length,
      parsed,
    };
  }

  /**
   * Tool: Get Unparsed Settlements
   * List settlements that haven't been parsed yet
   */
  @Tool({
    description: 'List settlements from discovery bot that have not been parsed yet',
  })
  async getUnparsed(): Promise<{
    count: number;
    settlements: { id: string; title: string; requirements_count: number }[];
  }> {
    const settlements = await getUnparsedSettlements();
    return {
      count: settlements.length,
      settlements: settlements.map(s => ({
        id: s.id,
        title: s.title,
        requirements_count: s.eligibility_rules?.requirements?.length || 0,
      })),
    };
  }

  /**
   * Resource: Logic Bot Capabilities
   */
  @Resource({
    description: 'Information about the Logic Bot capabilities',
    mimeType: 'application/json',
  })
  async getCapabilities() {
    return {
      name: 'Claimi Logic Bot',
      version: '1.0.0',
      description: 'Parses settlement requirements into general vs specific categories',
      tools: [
        {
          name: 'parseSettlement',
          description: 'Parse a single settlement\'s requirements',
        },
        {
          name: 'parseAllUnparsed',
          description: 'Parse all unparsed settlements',
        },
        {
          name: 'getParsedRequirements',
          description: 'Get parsed requirements by settlement ID',
        },
        {
          name: 'listParsed',
          description: 'List all parsed requirements',
        },
        {
          name: 'getUnparsed',
          description: 'List settlements awaiting parsing',
        },
      ],
      categories: {
        general: {
          description: 'Collected during onboarding - no specific proof needed',
          types: ['demographic', 'location', 'account', 'timeframe', 'other'],
        },
        specific: {
          description: 'Requires proof or specific user action',
          types: ['purchase', 'usage', 'transaction', 'document', 'action', 'other'],
        },
      },
    };
  }
}

