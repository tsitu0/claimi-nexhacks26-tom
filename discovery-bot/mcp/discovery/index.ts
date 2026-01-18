import { Tool, Resource, SchemaConstraint, Optional } from "@leanmcp/core";
import { discoverSettlement, discoverSettlements } from "../../src/agents/settlement-intake";
import { getSettlements, getSettlementById } from "../../src/lib/supabase";
import { DiscoveryResult, SettlementData } from "../../src/types/settlement";

/**
 * Input for discovering a single settlement
 */
class DiscoverSettlementInput {
  @SchemaConstraint({
    description: 'URL of the settlement page to scrape and analyze',
    pattern: '^https?://',
  })
  url!: string;
}

/**
 * Input for batch discovery
 */
class BatchDiscoveryInput {
  @SchemaConstraint({
    description: 'Array of settlement URLs to discover (max 10)',
  })
  urls!: string[];
}

/**
 * Input for getting settlement by ID
 */
class GetSettlementInput {
  @SchemaConstraint({
    description: 'UUID of the settlement to retrieve',
  })
  id!: string;
}

/**
 * Input for listing settlements
 */
class ListSettlementsInput {
  @Optional()
  @SchemaConstraint({
    description: 'Filter by status: discovered, parsed, verified, or expired',
    enum: ['discovered', 'parsed', 'verified', 'expired'],
  })
  status?: string;
}

/**
 * Settlement Discovery Service
 * MCP service for discovering and managing settlement claims
 */
export class DiscoveryService {
  
  /**
   * Tool: Discover Settlement
   * Scrape a settlement URL, parse eligibility rules, and store in database
   */
  @Tool({
    description: `Discover and analyze a settlement claim page. 
    Scrapes the page, extracts eligibility rules with citations, 
    and stores structured data in Supabase. 
    Returns parsed settlement with eligibility rules, deadline, and proof requirements.`,
    inputClass: DiscoverSettlementInput,
  })
  async discoverSettlement(input: DiscoverSettlementInput): Promise<DiscoveryResult> {
    const result = await discoverSettlement(input.url);
    return result;
  }

  /**
   * Tool: Batch Discover Settlements
   * Process multiple settlement URLs at once
   */
  @Tool({
    description: `Discover multiple settlement pages in batch. 
    Each URL is scraped, parsed, and stored. 
    Returns array of results for each URL.`,
    inputClass: BatchDiscoveryInput,
  })
  async batchDiscoverSettlements(input: BatchDiscoveryInput): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: DiscoveryResult[];
  }> {
    const results = await discoverSettlements(input.urls);
    
    return {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Tool: Get Settlement
   * Retrieve a specific settlement by ID
   */
  @Tool({
    description: 'Get a specific settlement by its UUID',
    inputClass: GetSettlementInput,
  })
  async getSettlement(input: GetSettlementInput): Promise<{
    found: boolean;
    settlement?: SettlementData;
  }> {
    const settlement = await getSettlementById(input.id);
    return {
      found: !!settlement,
      settlement: settlement || undefined,
    };
  }

  /**
   * Tool: List Settlements
   * Get all settlements, optionally filtered by status
   */
  @Tool({
    description: 'List all discovered settlements, optionally filtered by status',
    inputClass: ListSettlementsInput,
  })
  async listSettlements(input: ListSettlementsInput): Promise<{
    count: number;
    settlements: SettlementData[];
  }> {
    const settlements = await getSettlements(input.status);
    return {
      count: settlements.length,
      settlements,
    };
  }

  /**
   * Resource: Discovery Agent Capabilities
   */
  @Resource({
    description: 'Information about the Settlement Discovery Agent capabilities',
    mimeType: 'application/json',
  })
  async getCapabilities() {
    return {
      name: 'Settlement Discovery Agent',
      version: '1.0.0',
      description: 'Discovers, scrapes, and parses settlement claim pages into structured eligibility data',
      tools: [
        {
          name: 'discoverSettlement',
          description: 'Discover and parse a single settlement URL',
        },
        {
          name: 'batchDiscoverSettlements', 
          description: 'Process multiple settlement URLs',
        },
        {
          name: 'getSettlement',
          description: 'Retrieve a settlement by ID',
        },
        {
          name: 'listSettlements',
          description: 'List all discovered settlements',
        },
      ],
      outputSchema: {
        title: 'Settlement title',
        deadline: 'Claim submission deadline (YYYY-MM-DD)',
        eligibility_rules: {
          locations: 'Include/exclude location rules',
          date_range: 'Eligible date range',
          requirements: 'List of eligibility requirements',
          proof: 'Required documentation',
        },
        citations: 'Exact quotes with source URLs for verification',
        claim_url: 'URL to file the claim',
      },
    };
  }
}

