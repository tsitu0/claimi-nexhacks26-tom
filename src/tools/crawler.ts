import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Settlement source configuration
 */
interface SettlementSource {
  name: string;
  url: string;
  type: 'html' | 'rss';
  selector?: string;  // CSS selector for HTML sources
}

/**
 * Known settlement sources to crawl
 * Prioritized by quality and likelihood of having valid claim forms
 */
const SETTLEMENT_SOURCES: SettlementSource[] = [
  // Primary source - most reliable, has structured settlement pages
  {
    name: 'Top Class Actions - Open Settlements',
    url: 'https://topclassactions.com/lawsuit-settlements/open-lawsuit-settlements/',
    type: 'html',
    selector: 'a[href*="/lawsuit-settlements/open-lawsuit-settlements/"][href$="/"]',
  },
  // Secondary sources
  {
    name: 'Class Action Rebates',
    url: 'https://www.classactionrebates.com/settlements/',
    type: 'html',
    selector: 'a[href*="/settlements/"]',
  },
  {
    name: 'Consumer Finance Settlements',
    url: 'https://www.consumerfinance.gov/enforcement/payments-to-harmed-consumers/',
    type: 'html',
    selector: 'a[href*="settlement"]',
  },
];

/**
 * User agent for requests
 */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * URL patterns that indicate a settlement page (not a category/list page)
 */
const SETTLEMENT_URL_PATTERNS = [
  /settlement\/?$/i,
  /class-action-settlement\/?$/i,
  /-settlement\/?$/i,
  /lawsuit-settlements\/open-lawsuit-settlements\/[^\/]+\/?$/i,
];

/**
 * URL patterns to exclude (category pages, non-settlement pages)
 */
const EXCLUDE_URL_PATTERNS = [
  /\/category\//i,
  /\/page\/\d+/i,
  /\/tag\//i,
  /\/author\//i,
  /\/#/,
  /\/open-lawsuit-settlements\/?$/i,  // The main list page
  /\/lawsuit-news\/?$/i,
  /javascript:/i,
];

/**
 * Discovered settlement URL
 */
export interface DiscoveredUrl {
  url: string;
  source: string;
  title?: string;
  discoveredAt: string;
}

/**
 * Crawl a single source for settlement URLs
 */
async function crawlSource(source: SettlementSource): Promise<DiscoveredUrl[]> {
  const discovered: DiscoveredUrl[] = [];

  try {
    console.log(`🕷️  Crawling: ${source.name}`);
    
    const response = await axios.get(source.url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 30000,
    });

    if (source.type === 'html' && source.selector) {
      const $ = cheerio.load(response.data);
      const links = $(source.selector);
      
      links.each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        
        if (href && isValidSettlementUrl(href)) {
          // Normalize URL
          let fullUrl = href;
          if (!href.startsWith('http')) {
            const baseUrl = new URL(source.url);
            fullUrl = new URL(href, baseUrl.origin).href;
          }
          
          // Deduplicate within this crawl
          if (!discovered.some(d => d.url === fullUrl)) {
            discovered.push({
              url: fullUrl,
              source: source.name,
              title: title || undefined,
              discoveredAt: new Date().toISOString(),
            });
          }
        }
      });
    }
    
    console.log(`   Found ${discovered.length} settlement URLs`);
    
  } catch (error: any) {
    console.error(`❌ Error crawling ${source.name}:`, error.message);
  }

  return discovered;
}

/**
 * Check if a URL looks like a settlement detail page
 */
function isValidSettlementUrl(url: string): boolean {
  // Must not match any exclude patterns
  if (EXCLUDE_URL_PATTERNS.some(pattern => pattern.test(url))) {
    return false;
  }
  
  // Should match at least one settlement pattern
  // Or be a specific article URL (not a category)
  const isSettlementPattern = SETTLEMENT_URL_PATTERNS.some(pattern => pattern.test(url));
  const isSpecificArticle = /\/[a-z0-9-]+-[a-z0-9-]+\/?$/i.test(url) && 
                            url.includes('settlement') || 
                            url.includes('class-action');
  
  return isSettlementPattern || isSpecificArticle;
}

/**
 * Crawl all known sources for new settlement URLs
 */
export async function crawlSettlementSources(maxUrls: number = 10): Promise<DiscoveredUrl[]> {
  console.log('🔍 Starting settlement source crawl...');
  
  const allDiscovered: DiscoveredUrl[] = [];
  const seenUrls = new Set<string>();

  for (const source of SETTLEMENT_SOURCES) {
    try {
      const urls = await crawlSource(source);
      
      for (const discovered of urls) {
        if (!seenUrls.has(discovered.url)) {
          seenUrls.add(discovered.url);
          allDiscovered.push(discovered);
          
          if (allDiscovered.length >= maxUrls) {
            console.log(`📊 Reached max URLs (${maxUrls}), stopping crawl`);
            return allDiscovered;
          }
        }
      }
      
      // Be polite between sources
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      console.error(`Error with source ${source.name}:`, error.message);
    }
  }

  console.log(`✅ Crawl complete. Found ${allDiscovered.length} unique settlement URLs`);
  return allDiscovered;
}

/**
 * Get settlement URLs from a specific source URL
 */
export async function crawlSpecificSource(
  url: string, 
  selector: string = 'a[href*="settlement"]'
): Promise<DiscoveredUrl[]> {
  const source: SettlementSource = {
    name: 'Custom Source',
    url,
    type: 'html',
    selector,
  };
  
  return crawlSource(source);
}

/**
 * Parse RSS feed for settlement URLs (if available)
 */
export async function parseRssFeed(feedUrl: string): Promise<DiscoveredUrl[]> {
  const discovered: DiscoveredUrl[] = [];
  
  try {
    const response = await axios.get(feedUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });
    
    const $ = cheerio.load(response.data, { xmlMode: true });
    
    $('item').each((_, item) => {
      const link = $(item).find('link').text().trim();
      const title = $(item).find('title').text().trim();
      const pubDate = $(item).find('pubDate').text().trim();
      
      if (link && isValidSettlementUrl(link)) {
        discovered.push({
          url: link,
          source: 'RSS Feed',
          title,
          discoveredAt: pubDate || new Date().toISOString(),
        });
      }
    });
    
  } catch (error: any) {
    console.error('Error parsing RSS feed:', error.message);
  }
  
  return discovered;
}

