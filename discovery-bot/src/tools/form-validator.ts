import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * User agent for requests
 */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Form field information
 */
export interface FormField {
  type: string;
  name: string;
  label?: string;
  required: boolean;
  options?: string[];  // For select/radio fields
}

/**
 * Form validation result
 */
export interface FormValidationResult {
  isValid: boolean;
  hasForm: boolean;
  formUrl: string;
  formAction?: string;
  formMethod?: string;
  fields: FormField[];
  fieldCount: number;
  hasRequiredFields: boolean;
  reason?: string;
}

/**
 * Common settlement form domains that are known to have valid forms
 */
const KNOWN_FORM_DOMAINS = [
  'simpluris.com',
  'settlementclass.com',
  'kfrclassaction.com',
  'classaction.org',
  'gcgadmin.com',
  'epiqglobal.com',
  'rust-oleum.com',
  'atticus-administration.com',
  'angeiongroup.com',
  'kfrllc.com',
  'gilardi.com',
  'abcourtsettlements.com',
];

/**
 * Check if a URL is from a known claim form provider
 */
export function isKnownFormDomain(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return KNOWN_FORM_DOMAINS.some(domain => 
      urlObj.hostname.includes(domain)
    );
  } catch {
    return false;
  }
}

/**
 * Validate a claim form URL by checking if it has fillable fields
 */
export async function validateClaimForm(url: string): Promise<FormValidationResult> {
  const result: FormValidationResult = {
    isValid: false,
    hasForm: false,
    formUrl: url,
    fields: [],
    fieldCount: 0,
    hasRequiredFields: false,
  };

  try {
    // Fetch the form page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 20000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // Find forms on the page
    const forms = $('form');
    
    if (forms.length === 0) {
      result.reason = 'No form elements found on page';
      return result;
    }

    result.hasForm = true;

    // Analyze the first significant form (skip search forms, newsletter forms)
    let mainFormSelector: string | null = null;
    let mainFormIndex = -1;
    
    forms.each((idx, form) => {
      const $form = $(form);
      const action = $form.attr('action') || '';
      const formId = $form.attr('id') || '';
      const formClass = $form.attr('class') || '';
      
      // Skip common non-claim forms
      if (
        action.includes('search') ||
        action.includes('newsletter') ||
        action.includes('subscribe') ||
        formId.includes('search') ||
        formClass.includes('search') ||
        formClass.includes('newsletter')
      ) {
        return;
      }

      // Count input fields in this form
      const inputs = $form.find('input, select, textarea');
      if (inputs.length >= 3 && mainFormIndex === -1) {
        mainFormIndex = idx;
        result.formAction = action;
        result.formMethod = $form.attr('method') || 'get';
      }
    });

    if (mainFormIndex === -1) {
      result.reason = 'No claim form found (only search/newsletter forms)';
      return result;
    }

    const mainForm = forms.eq(mainFormIndex);

    // Extract form fields
    const extractedFields: FormField[] = [];

    // Input fields
    mainForm.find('input').each((_, input) => {
      const $input = $(input);
      const type = $input.attr('type') || 'text';
      const name = $input.attr('name') || '';
      
      // Skip hidden, submit, button fields
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) {
        return;
      }

      // Find associated label
      const id = $input.attr('id');
      let label = '';
      if (id) {
        label = $(`label[for="${id}"]`).text().trim();
      }
      if (!label) {
        label = $input.closest('label').text().trim();
      }
      if (!label) {
        label = $input.attr('placeholder') || name;
      }

      extractedFields.push({
        type,
        name,
        label,
        required: $input.attr('required') !== undefined,
      });
    });

    // Select fields
    mainForm.find('select').each((_, select) => {
      const $select = $(select);
      const name = $select.attr('name') || '';
      
      const id = $select.attr('id');
      let label = '';
      if (id) {
        label = $(`label[for="${id}"]`).text().trim();
      }

      const options: string[] = [];
      $select.find('option').each((_, opt) => {
        const optText = $(opt).text().trim();
        if (optText && optText !== '-- Select --' && optText !== 'Select') {
          options.push(optText);
        }
      });

      extractedFields.push({
        type: 'select',
        name,
        label,
        required: $select.attr('required') !== undefined,
        options: options.slice(0, 10), // Limit options stored
      });
    });

    // Textarea fields
    mainForm.find('textarea').each((_, textarea) => {
      const $textarea = $(textarea);
      const name = $textarea.attr('name') || '';
      
      const id = $textarea.attr('id');
      let label = '';
      if (id) {
        label = $(`label[for="${id}"]`).text().trim();
      }

      extractedFields.push({
        type: 'textarea',
        name,
        label,
        required: $textarea.attr('required') !== undefined,
      });
    });

    result.fields = extractedFields;
    result.fieldCount = extractedFields.length;
    result.hasRequiredFields = extractedFields.some(f => f.required);

    // Determine if valid
    // Valid if: has at least 3 fillable fields and includes common claim fields
    const hasNameField = extractedFields.some(f => 
      /name|first|last/i.test(f.name) || /name|first|last/i.test(f.label || '')
    );
    const hasContactField = extractedFields.some(f => 
      /email|phone|address|zip|city|state/i.test(f.name) || 
      /email|phone|address|zip|city|state/i.test(f.label || '')
    );

    if (extractedFields.length >= 3 && (hasNameField || hasContactField)) {
      result.isValid = true;
    } else if (extractedFields.length >= 5) {
      // If many fields, probably valid even without name/contact
      result.isValid = true;
    } else {
      result.reason = `Insufficient form fields: ${extractedFields.length} fields, needs name or contact info`;
    }

  } catch (error: any) {
    result.reason = `Failed to fetch form: ${error.message}`;
  }

  return result;
}

/**
 * Extract claim form URL from a settlement info page
 */
export async function extractClaimFormUrl(
  html: string, 
  baseUrl: string
): Promise<{
  claimUrl: string | null;
  infoUrl: string;
  formUrls: string[];
}> {
  const $ = cheerio.load(html);
  const formUrls: string[] = [];
  
  // Keywords indicating a claim form link
  const claimKeywords = [
    'file a claim',
    'file claim',
    'submit a claim',
    'submit claim',
    'claim form',
    'file your claim',
    'start claim',
    'begin claim',
    'click here to file',
    'online claim',
    'make a claim',
  ];

  // Settlement administrator domain patterns
  const adminDomains = [
    'simpluris',
    'settlementclass',
    'kfrclassaction',
    'gcgadmin',
    'epiqglobal',
    'atticus',
    'angeion',
    'kfrllc',
    'gilardi',
  ];

  // First, look for links with claim-related text
  $('a').each((_, el) => {
    const $link = $(el);
    const text = $link.text().toLowerCase().trim();
    const href = $link.attr('href');
    
    if (!href) return;
    
    try {
      const absoluteUrl = new URL(href, baseUrl).href;
      
      // Check if link text matches claim keywords
      const isClaimLink = claimKeywords.some(kw => text.includes(kw));
      
      // Check if URL is from a known admin domain
      const isAdminDomain = adminDomains.some(d => absoluteUrl.toLowerCase().includes(d));
      
      if (isClaimLink || isAdminDomain) {
        if (!formUrls.includes(absoluteUrl)) {
          formUrls.push(absoluteUrl);
        }
      }
    } catch {
      // Invalid URL
    }
  });

  // Also check for settlement website mentions
  const text = $.text();
  const websiteMatches = text.match(/(?:www\.)?[a-z0-9-]+(?:settlement|claims?|classaction)[a-z0-9-]*\.(?:com|org|net)/gi);
  if (websiteMatches) {
    for (const match of websiteMatches) {
      const url = match.startsWith('www.') ? `https://${match}` : `https://www.${match}`;
      if (!formUrls.includes(url)) {
        formUrls.push(url);
      }
    }
  }

  return {
    claimUrl: formUrls[0] || null,
    infoUrl: baseUrl,
    formUrls,
  };
}

/**
 * Check if a settlement has a valid, fillable claim form
 */
export async function hasValidClaimForm(claimUrl: string | null): Promise<{
  valid: boolean;
  formInfo?: FormValidationResult;
  reason?: string;
}> {
  if (!claimUrl) {
    return { valid: false, reason: 'No claim URL provided' };
  }

  // Quick check for known domains
  if (isKnownFormDomain(claimUrl)) {
    return { 
      valid: true, 
      reason: 'Known settlement administrator domain',
    };
  }

  // Validate the actual form
  const formInfo = await validateClaimForm(claimUrl);
  
  return {
    valid: formInfo.isValid,
    formInfo,
    reason: formInfo.reason,
  };
}

