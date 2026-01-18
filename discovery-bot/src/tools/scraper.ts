import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedPage, PageSection } from '../types/settlement';

/**
 * User agent to avoid bot detection
 */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch a settlement case page and return raw HTML
 */
export async function fetchCasePage(url: string): Promise<{ html: string; status: number }> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 30000,
      maxRedirects: 5,
    });

    return {
      html: response.data,
      status: response.status,
    };
  } catch (error: any) {
    console.error(`Error fetching ${url}:`, error.message);
    throw new Error(`Failed to fetch page: ${error.message}`);
  }
}

/**
 * Extract relevant sections from a settlement page
 */
export function extractRelevantSections(html: string, sourceUrl: string): ScrapedPage {
  const $ = cheerio.load(html);
  
  // Remove script, style, and nav elements
  $('script, style, nav, footer, header, aside, .sidebar, .menu, .navigation').remove();
  
  // Get page title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                'Untitled Settlement';

  // Extract sections based on headings
  const sections: PageSection[] = [];
  
  // Look for common settlement page patterns
  const sectionSelectors = [
    // Common settlement page structures
    'article', '.content', '.main-content', '#content', 'main',
    '.settlement-info', '.case-details', '.eligibility',
    // Sections by heading
    'section', '.section',
  ];

  // First, try to find main content area
  let mainContent = $('article, .content, .main-content, #content, main').first();
  if (mainContent.length === 0) {
    mainContent = $('body');
  }

  // Extract sections by headings (h1, h2, h3)
  const headings = mainContent.find('h1, h2, h3, h4');
  
  headings.each((_, heading) => {
    const $heading = $(heading);
    const headingText = $heading.text().trim();
    
    // Skip empty or navigation headings
    if (!headingText || headingText.length < 3) return;
    
    // Get content after this heading until next heading
    let content = '';
    let contentHtml = '';
    let $next = $heading.next();
    
    while ($next.length && !$next.is('h1, h2, h3, h4')) {
      content += $next.text().trim() + '\n';
      contentHtml += $.html($next);
      $next = $next.next();
    }
    
    if (content.trim()) {
      sections.push({
        heading: headingText,
        content: content.trim(),
        html: contentHtml,
      });
    }
  });

  // If no sections found, extract paragraphs
  if (sections.length === 0) {
    const paragraphs = mainContent.find('p');
    let combinedContent = '';
    let combinedHtml = '';
    
    paragraphs.each((_, p) => {
      const text = $(p).text().trim();
      if (text.length > 50) {
        combinedContent += text + '\n\n';
        combinedHtml += $.html(p);
      }
    });
    
    if (combinedContent) {
      sections.push({
        heading: 'Main Content',
        content: combinedContent.trim(),
        html: combinedHtml,
      });
    }
  }

  // Get full text content
  const fullText = mainContent.text()
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  return {
    url: sourceUrl,
    title,
    html,
    text: fullText,
    sections,
  };
}

/**
 * Find settlement-specific content patterns
 */
export function findSettlementPatterns(scrapedPage: ScrapedPage): {
  eligibilitySection?: PageSection;
  deadlineSection?: PageSection;
  claimSection?: PageSection;
  proofSection?: PageSection;
} {
  const result: {
    eligibilitySection?: PageSection;
    deadlineSection?: PageSection;
    claimSection?: PageSection;
    proofSection?: PageSection;
  } = {};

  const eligibilityKeywords = ['eligib', 'qualify', 'who can', 'requirements', 'criteria'];
  const deadlineKeywords = ['deadline', 'submit by', 'last day', 'expires', 'must be received'];
  const claimKeywords = ['file a claim', 'submit claim', 'claim form', 'how to claim'];
  const proofKeywords = ['proof', 'documentation', 'evidence', 'receipt', 'records'];

  for (const section of scrapedPage.sections) {
    const lowerHeading = section.heading.toLowerCase();
    const lowerContent = section.content.toLowerCase();

    if (eligibilityKeywords.some(kw => lowerHeading.includes(kw) || lowerContent.slice(0, 200).includes(kw))) {
      result.eligibilitySection = section;
    }
    if (deadlineKeywords.some(kw => lowerHeading.includes(kw) || lowerContent.slice(0, 200).includes(kw))) {
      result.deadlineSection = section;
    }
    if (claimKeywords.some(kw => lowerHeading.includes(kw) || lowerContent.slice(0, 200).includes(kw))) {
      result.claimSection = section;
    }
    if (proofKeywords.some(kw => lowerHeading.includes(kw) || lowerContent.slice(0, 200).includes(kw))) {
      result.proofSection = section;
    }
  }

  return result;
}

/**
 * Extract potential dates from text
 */
export function extractDates(text: string): string[] {
  const datePatterns = [
    // MM/DD/YYYY or MM-DD-YYYY
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,
    // Month DD, YYYY
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
    // YYYY-MM-DD (ISO)
    /\b(\d{4}-\d{2}-\d{2})\b/g,
  ];

  const dates: string[] = [];
  
  for (const pattern of datePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      dates.push(match[1]);
    }
  }

  return [...new Set(dates)];
}

/**
 * Extract URLs from HTML
 */
export function extractUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        urls.push(absoluteUrl);
      } catch {
        // Invalid URL, skip
      }
    }
  });

  return [...new Set(urls)];
}

/**
 * Find claim form URL from page
 * Prioritizes external settlement administrator sites over internal links
 */
export function findClaimFormUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  
  // Priority 1: Look for links with explicit claim text that go to EXTERNAL sites
  const claimKeywords = [
    'click here to file a claim',
    'file a claim',
    'submit a claim', 
    'submit claim',
    'claim form',
    'file now',
    'start claim',
    'begin claim',
    'file your claim',
    'make a claim',
  ];
  
  // Known settlement administrator domains (prioritize these)
  const adminDomains = [
    'settlement.com',
    'settlements.com', 
    'classaction.com',
    'simpluris.com',
    'gcgadmin.com',
    'epiqglobal.com',
    'kfrclassaction.com',
    'angeiongroup.com',
    'gilardi.com',
  ];

  let externalClaimUrl: string | null = null;
  let internalClaimUrl: string | null = null;
  
  $('a').each((_, el) => {
    const $link = $(el);
    const text = $link.text().toLowerCase().trim();
    const href = $link.attr('href');
    
    if (!href || href.startsWith('javascript:') || href === '#') return;
    
    // Check if text matches claim keywords
    const isClaimLink = claimKeywords.some(kw => text.includes(kw));
    
    if (isClaimLink) {
      try {
        const fullUrl = new URL(href, baseUrl).href;
        const urlHost = new URL(fullUrl).hostname;
        const baseHost = new URL(baseUrl).hostname;
        
        // Check if it's an external link (different domain)
        const isExternal = urlHost !== baseHost;
        
        // Check if it's a known admin domain
        const isAdminDomain = adminDomains.some(d => urlHost.includes(d));
        
        if (isExternal || isAdminDomain) {
          externalClaimUrl = fullUrl;
          return false; // Found best match, stop
        } else if (!internalClaimUrl) {
          internalClaimUrl = fullUrl;
        }
      } catch {
        // Invalid URL
      }
    }
  });

  // Priority 2: Look for settlement website mentions in text
  if (!externalClaimUrl) {
    const text = $.text();
    
    // Look for "Settlement Website: xyz.com" pattern
    const websiteMatch = text.match(/settlement\s*website[:\s]+([a-z0-9-]+\.(?:com|org|net))/i);
    if (websiteMatch) {
      externalClaimUrl = `https://www.${websiteMatch[1].toLowerCase()}`;
    }
    
    // Look for URLs ending in -settlement.com or similar
    const urlMatches = text.match(/(?:www\.)?[a-z0-9-]+-?(?:settlement|settlements|claims?)[a-z0-9-]*\.(?:com|org|net)/gi);
    if (urlMatches && urlMatches.length > 0) {
      const match = urlMatches[0];
      externalClaimUrl = match.startsWith('www.') ? `https://${match}` : `https://www.${match}`;
    }
  }

  // Priority 3: Look for links to known admin domains even without claim text
  if (!externalClaimUrl) {
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      
      try {
        const fullUrl = new URL(href, baseUrl).href;
        const urlHost = new URL(fullUrl).hostname;
        
        if (adminDomains.some(d => urlHost.includes(d))) {
          externalClaimUrl = fullUrl;
          return false;
        }
      } catch {
        // Invalid URL
      }
    });
  }

  // Return external URL first, then internal, then null
  return externalClaimUrl || internalClaimUrl || null;
}

