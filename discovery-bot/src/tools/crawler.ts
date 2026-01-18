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
 * DIVERSIFIED across multiple sources for variety
 */
const SETTLEMENT_SOURCES: SettlementSource[] = [
  // === Source 1: Top Class Actions - Open Settlements (primary) ===
  {
    name: 'Top Class Actions - Open',
    url: 'https://topclassactions.com/lawsuit-settlements/open-lawsuit-settlements/',
    type: 'html',
    selector: 'a[href*="/lawsuit-settlements/open-lawsuit-settlements/"][href$="/"]',
  },
  // === Source 2: Top Class Actions - Page 2 (more settlements) ===
  {
    name: 'Top Class Actions - Page 2',
    url: 'https://topclassactions.com/lawsuit-settlements/open-lawsuit-settlements/page/2/',
    type: 'html',
    selector: 'a[href*="/lawsuit-settlements/open-lawsuit-settlements/"][href$="/"]',
  },
  // === Source 3: Top Class Actions - Page 3 ===
  {
    name: 'Top Class Actions - Page 3',
    url: 'https://topclassactions.com/lawsuit-settlements/open-lawsuit-settlements/page/3/',
    type: 'html',
    selector: 'a[href*="/lawsuit-settlements/open-lawsuit-settlements/"][href$="/"]',
  },
  // === Source 4: Class Action Rebates ===
  {
    name: 'Class Action Rebates',
    url: 'https://www.classactionrebates.com/settlements/',
    type: 'html',
    selector: 'a[href*="classactionrebates.com/settlements/"][href$="/"]',
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
 * URL patterns to exclude (category pages, non-settlement pages, social shares)
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
  // Social share links
  /facebook\.com\/sharer/i,
  /twitter\.com\/intent/i,
  /linkedin\.com\/share/i,
  /pinterest\.com\/pin/i,
  /reddit\.com\/submit/i,
  /mailto:/i,
  /whatsapp:/i,
  // Other non-settlement URLs
  /\/feed\/?$/i,
  /\/rss\/?$/i,
  /\.pdf$/i,
  /\/contact\/?$/i,
  /\/about\/?$/i,
  /\/privacy\/?$/i,
  /\/terms\/?$/i,
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
 * Balances across sources to ensure diversity
 */
export async function crawlSettlementSources(maxUrls: number = 10): Promise<DiscoveredUrl[]> {
  console.log('🔍 Starting multi-source settlement crawl...');
  
  // First, crawl all sources and collect URLs
  const urlsBySource: Map<string, DiscoveredUrl[]> = new Map();
  
  for (const source of SETTLEMENT_SOURCES) {
    try {
      const urls = await crawlSource(source);
      if (urls.length > 0) {
        urlsBySource.set(source.name, urls);
      }
      // Be polite between sources
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      console.error(`Error with source ${source.name}:`, error.message);
    }
  }
  
  console.log(`📊 Crawled ${urlsBySource.size} sources`);
  
  // Balance selection across sources (round-robin style)
  const allDiscovered: DiscoveredUrl[] = [];
  const seenUrls = new Set<string>();
  const sourceNames = Array.from(urlsBySource.keys());
  const sourceIndices = new Map<string, number>();
  sourceNames.forEach(name => sourceIndices.set(name, 0));
  
  // Keep selecting from sources in round-robin until we have enough or exhausted all
  let exhaustedSources = 0;
  while (allDiscovered.length < maxUrls && exhaustedSources < sourceNames.length) {
    exhaustedSources = 0;
    
    for (const sourceName of sourceNames) {
      if (allDiscovered.length >= maxUrls) break;
      
      const sourceUrls = urlsBySource.get(sourceName) || [];
      const currentIndex = sourceIndices.get(sourceName) || 0;
      
      if (currentIndex >= sourceUrls.length) {
        exhaustedSources++;
        continue;
      }
      
      const url = sourceUrls[currentIndex];
      sourceIndices.set(sourceName, currentIndex + 1);
      
      if (!seenUrls.has(url.url)) {
        seenUrls.add(url.url);
        allDiscovered.push(url);
        console.log(`   📎 [${sourceName.substring(0, 20)}...] ${url.title?.substring(0, 40) || url.url.substring(0, 40)}...`);
      }
    }
  }

  console.log(`✅ Crawl complete. Found ${allDiscovered.length} unique settlement URLs from ${urlsBySource.size} sources`);
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

