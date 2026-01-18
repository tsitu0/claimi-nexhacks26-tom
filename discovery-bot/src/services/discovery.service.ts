import { Tool, Resource, SchemaConstraint, Optional } from "@leanmcp/core";
import { discoverSettlement, discoverSettlements } from "../agents/settlement-intake";
import { autoDiscoverSettlements, getAutoDiscoveryStatus, AutoDiscoveryResult } from "../agents/auto-discovery";
import { getSettlements, getSettlementById } from "../lib/supabase";
import { DiscoveryResult, SettlementData } from "../types/settlement";

/**
 * Input for discovering a single settlement
 */
class DiscoverSettlementInput {
  @SchemaConstraint({
    description: 'URL of the settlement page to scrape and analyze',
    pattern: '^https?://',
  })
  url!: string;

  @Optional()
  @SchemaConstraint({
    description: 'Force re-discovery even if settlement already exists in database',
  })
  force?: boolean;
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
 * Input for auto-discovery
 */
class AutoDiscoverInput {
  @Optional()
  @SchemaConstraint({
    description: 'Maximum number of settlements to discover (default: 5, max: 5 per day)',
    minimum: 1,
    maximum: 5,
  })
  max?: number;
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
    description: `Discover and analyze a settlement claim page. Scrapes the page, extracts eligibility rules with citations, and stores structured data in Supabase. Returns parsed settlement with eligibility rules, deadline, and proof requirements.`,
    inputClass: DiscoverSettlementInput,
  })
  async discoverSettlement(input: DiscoverSettlementInput): Promise<DiscoveryResult> {
    const result = await discoverSettlement(input.url, input.force ?? false);
    return result;
  }

  /**
   * Tool: Batch Discover Settlements
   * Process multiple settlement URLs at once
   */
  @Tool({
    description: `Discover multiple settlement pages in batch. Each URL is scraped, parsed, and stored. Returns array of results for each URL.`,
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
   * Tool: Auto-Discover Settlements
   * Automatically crawl sources and discover new settlements
   * Rate limited to 5 discoveries per day
   */
  @Tool({
    description: `Automatically crawl known settlement sources (like topclassactions.com) and discover new settlements. Rate limited to 5 discoveries per day. Returns discovered settlements and remaining quota.`,
    inputClass: AutoDiscoverInput,
  })
  async autoDiscover(input: AutoDiscoverInput): Promise<AutoDiscoveryResult> {
    const result = await autoDiscoverSettlements(input.max);
    return result;
  }

  /**
   * Tool: Get Discovery Status
   * Check rate limit status and today's discoveries
   */
  @Tool({
    description: `Check the current auto-discovery status including daily limit, remaining quota, and today's discovered URLs.`,
  })
  async getDiscoveryStatus(): Promise<{
    daily_limit: number;
    used_today: number;
    remaining_today: number;
    last_discovery_at: string | null;
    discovered_urls_today: string[];
  }> {
    return await getAutoDiscoveryStatus();
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
      version: '2.0.0',
      description: 'Discovers, scrapes, and parses settlement claim pages into structured eligibility data with auto-discovery',
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
          name: 'autoDiscover',
          description: 'Automatically find and discover new settlements (max 5/day)',
        },
        {
          name: 'getDiscoveryStatus',
          description: 'Check rate limit and today\'s discovery stats',
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
      rate_limits: {
        auto_discovery: '5 settlements per day',
        resets_at: 'Midnight UTC',
      },
      sources: [
        'topclassactions.com/lawsuit-settlements/open-lawsuit-settlements/',
        'topclassactions.com/category/lawsuit-settlements/lawsuit-news/',
      ],
    };
  }
}

