import { crawlSettlementSources, DiscoveredUrl } from '../tools/crawler';
import { discoverSettlement } from './settlement-intake';
import { settlementExists } from '../lib/supabase';
import { canDiscoverMore, incrementDiscoveryCount, getDiscoveryStats, getDailyLimit } from '../lib/rate-limiter';
import { DiscoveryResult } from '../types/settlement';

/**
 * Auto-discovery result
 */
export interface AutoDiscoveryResult {
  success: boolean;
  discovered: number;
  failed: number;
  skipped: number;
  remaining_today: number;
  results: {
    url: string;
    status: 'success' | 'failed' | 'skipped' | 'rate_limited';
    title?: string;
    error?: string;
  }[];
  message: string;
}

/**
 * Auto-discover new settlements from known sources
 * Respects the daily rate limit (max 5 per day)
 */
export async function autoDiscoverSettlements(
  maxToDiscover?: number
): Promise<AutoDiscoveryResult> {
  console.log('🤖 Starting auto-discovery...');

  // Check rate limit
  const rateCheck = await canDiscoverMore();
  if (!rateCheck.allowed) {
    return {
      success: false,
      discovered: 0,
      failed: 0,
      skipped: 0,
      remaining_today: 0,
      results: [],
      message: rateCheck.reason || 'Daily limit reached',
    };
  }

  // Determine how many we can discover
  const limit = Math.min(
    maxToDiscover || getDailyLimit(),
    rateCheck.remaining
  );

  console.log(`📊 Rate limit: ${rateCheck.remaining} remaining today, will discover up to ${limit}`);

  // Crawl sources for settlement URLs
  const crawledUrls = await crawlSettlementSources(limit * 3); // Get extra in case some are duplicates

  if (crawledUrls.length === 0) {
    return {
      success: true,
      discovered: 0,
      failed: 0,
      skipped: 0,
      remaining_today: rateCheck.remaining,
      results: [],
      message: 'No new settlement URLs found from sources',
    };
  }

  console.log(`🔗 Found ${crawledUrls.length} potential URLs, filtering...`);

  // Filter out already-discovered URLs
  const newUrls: DiscoveredUrl[] = [];
  for (const url of crawledUrls) {
    try {
      const exists = await settlementExists(url.url);
      if (!exists) {
        newUrls.push(url);
        if (newUrls.length >= limit) break;
      }
    } catch (error) {
      // If check fails, include it anyway
      newUrls.push(url);
      if (newUrls.length >= limit) break;
    }
  }

  console.log(`✨ ${newUrls.length} new URLs to discover`);

  if (newUrls.length === 0) {
    return {
      success: true,
      discovered: 0,
      failed: 0,
      skipped: crawledUrls.length,
      remaining_today: rateCheck.remaining,
      results: crawledUrls.map(u => ({
        url: u.url,
        status: 'skipped' as const,
        title: u.title,
        error: 'Already exists in database',
      })),
      message: 'All found URLs already exist in database',
    };
  }

  // Discover each new URL
  const results: AutoDiscoveryResult['results'] = [];
  let discovered = 0;
  let failed = 0;
  let skipped = 0;

  for (const urlInfo of newUrls) {
    // Re-check rate limit before each discovery
    const currentCheck = await canDiscoverMore();
    if (!currentCheck.allowed) {
      results.push({
        url: urlInfo.url,
        status: 'rate_limited',
        title: urlInfo.title,
        error: 'Daily rate limit reached',
      });
      break;
    }

    console.log(`\n📥 Discovering: ${urlInfo.url}`);

    try {
      const result = await discoverSettlement(urlInfo.url);

      if (result.success) {
        // Increment rate limit counter
        await incrementDiscoveryCount(urlInfo.url);
        
        discovered++;
        results.push({
          url: urlInfo.url,
          status: 'success',
          title: result.settlement?.title || urlInfo.title,
        });
        console.log(`✅ Discovered: ${result.settlement?.title}`);
      } else {
        if (result.error?.includes('already exists')) {
          skipped++;
          results.push({
            url: urlInfo.url,
            status: 'skipped',
            title: urlInfo.title,
            error: result.error,
          });
        } else {
          failed++;
          results.push({
            url: urlInfo.url,
            status: 'failed',
            title: urlInfo.title,
            error: result.error,
          });
        }
      }
    } catch (error: any) {
      failed++;
      results.push({
        url: urlInfo.url,
        status: 'failed',
        title: urlInfo.title,
        error: error.message,
      });
      console.error(`❌ Failed: ${error.message}`);
    }

    // Be polite between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Get final remaining count
  const finalStats = await getDiscoveryStats();
  const remaining = getDailyLimit() - finalStats.discoveries_count;

  return {
    success: true,
    discovered,
    failed,
    skipped,
    remaining_today: Math.max(0, remaining),
    results,
    message: `Auto-discovery complete. Discovered ${discovered} new settlements, ${failed} failed, ${skipped} skipped. ${remaining} discoveries remaining today.`,
  };
}

/**
 * Get current auto-discovery status
 */
export async function getAutoDiscoveryStatus(): Promise<{
  daily_limit: number;
  used_today: number;
  remaining_today: number;
  last_discovery_at: string | null;
  discovered_urls_today: string[];
}> {
  const stats = await getDiscoveryStats();
  
  return {
    daily_limit: getDailyLimit(),
    used_today: stats.discoveries_count,
    remaining_today: Math.max(0, getDailyLimit() - stats.discoveries_count),
    last_discovery_at: stats.last_discovery_at,
    discovered_urls_today: stats.discovered_urls || [],
  };
}

