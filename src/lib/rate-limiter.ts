import { getSupabase } from './supabase';

/**
 * Daily discovery limit
 */
const DAILY_DISCOVERY_LIMIT = 5;

/**
 * Discovery stats tracking
 */
export interface DiscoveryStats {
  date: string;
  discoveries_count: number;
  last_discovery_at: string | null;
  discovered_urls: string[];
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get or create today's discovery stats
 */
export async function getDiscoveryStats(): Promise<DiscoveryStats> {
  const client = getSupabase();
  const today = getTodayDate();

  const { data, error } = await client
    .from('discovery_stats')
    .select('*')
    .eq('date', today)
    .single();

  if (error && error.code === 'PGRST116') {
    // No record for today, create one
    const newStats: DiscoveryStats = {
      date: today,
      discoveries_count: 0,
      last_discovery_at: null,
      discovered_urls: [],
    };

    const { data: created, error: createError } = await client
      .from('discovery_stats')
      .insert(newStats)
      .select()
      .single();

    if (createError) {
      console.error('Error creating discovery stats:', createError);
      // Return default stats if we can't create
      return newStats;
    }

    return created;
  }

  if (error) {
    console.error('Error fetching discovery stats:', error);
    throw error;
  }

  return data;
}

/**
 * Check if we can discover more settlements today
 */
export async function canDiscoverMore(): Promise<{
  allowed: boolean;
  remaining: number;
  reason?: string;
}> {
  try {
    const stats = await getDiscoveryStats();
    const remaining = DAILY_DISCOVERY_LIMIT - stats.discoveries_count;

    if (remaining <= 0) {
      return {
        allowed: false,
        remaining: 0,
        reason: `Daily limit of ${DAILY_DISCOVERY_LIMIT} discoveries reached. Resets at midnight UTC.`,
      };
    }

    return {
      allowed: true,
      remaining,
    };
  } catch (error: any) {
    // If rate limiting fails, allow but log
    console.error('Rate limiter error, allowing discovery:', error.message);
    return {
      allowed: true,
      remaining: DAILY_DISCOVERY_LIMIT,
      reason: 'Rate limiter unavailable, proceeding with default limit',
    };
  }
}

/**
 * Increment the discovery count for today
 */
export async function incrementDiscoveryCount(url: string): Promise<void> {
  const client = getSupabase();
  const today = getTodayDate();

  try {
    // Get current stats
    const stats = await getDiscoveryStats();

    // Update with new count
    const { error } = await client
      .from('discovery_stats')
      .update({
        discoveries_count: stats.discoveries_count + 1,
        last_discovery_at: new Date().toISOString(),
        discovered_urls: [...(stats.discovered_urls || []), url],
      })
      .eq('date', today);

    if (error) {
      console.error('Error incrementing discovery count:', error);
    }
  } catch (error: any) {
    console.error('Error in incrementDiscoveryCount:', error.message);
  }
}

/**
 * Get the daily limit
 */
export function getDailyLimit(): number {
  return DAILY_DISCOVERY_LIMIT;
}

/**
 * SQL to create the discovery_stats table
 */
export const DISCOVERY_STATS_TABLE_SQL = `
-- Create discovery_stats table for rate limiting
CREATE TABLE IF NOT EXISTS discovery_stats (
  date DATE PRIMARY KEY,
  discoveries_count INTEGER NOT NULL DEFAULT 0,
  last_discovery_at TIMESTAMPTZ,
  discovered_urls JSONB NOT NULL DEFAULT '[]'
);

-- Create index for quick date lookups
CREATE INDEX IF NOT EXISTS idx_discovery_stats_date ON discovery_stats(date);

-- Enable RLS
ALTER TABLE discovery_stats ENABLE ROW LEVEL SECURITY;

-- Allow all operations (for hackathon)
CREATE POLICY "Allow all operations" ON discovery_stats
  FOR ALL USING (true) WITH CHECK (true);
`;

