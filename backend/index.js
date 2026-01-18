import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Initialize OpenAI client (optional - only needed for autofill triage)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("OpenAI client initialized for autofill triage");
} else {
  console.warn("OPENAI_API_KEY not set - autofill triage will use fallback heuristics");
}

app.get("/health", async (_req, res) => {
  const { error } = await supabase.storage.listBuckets();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, openaiEnabled: !!openai });
});

// ============================================================================
// AUTOFILL TRIAGE ENDPOINT - LLM-powered field classification
// ============================================================================

const TRIAGE_SYSTEM_PROMPT = `You are a form field classifier for an auto-fill system. Your job is to classify each form field into one of these categories:

CATEGORIES:

1. STANDARD_PROFILE - ONLY these exact types of fields (strict whitelist):
   - First Name, Last Name, Full Name, Legal Name
   - Email, Email Address
   - Phone, Phone Number, Telephone, Mobile
   - Street Address, Mailing Address, Address Line 1, Address Line 2
   - Apartment, Unit, Suite, Apt
   - City, State, Province, ZIP Code, Postal Code, Country
   - Date of Birth, Birthday, DOB
   
   IMPORTANT: If the field asks for ANY of the following, it is NOT STANDARD_PROFILE:
   - Any price, cost, amount, fee, commission, payment, sale price
   - Any brokerage, agent name, company name, business name
   - Any "previous", "former", "at time of", "of home sold"
   - Any spouse, employer, third party information
   
2. CASE_ANSWER - Questions about the specific claim/case that may have been pre-answered:
   - Yes/no questions: "Did you purchase...?", "Were you affected...?", "Do you have...?"
   - Selection questions: "Select which applies", "Choose your category"
   - Specific claim data: prices, amounts, dates related to the claim (NOT the user's profile)
   - Examples: "Home Sale Price", "Commission Paid", "Purchase Amount", "Listing Brokerage"
   - If it asks about money/amounts related to the CLAIM (not user profile), it's CASE_ANSWER
   
3. CONTEXTUAL_DATA - Data fields that are claim-specific but might be pre-answered:
   - "Address of home sold", "Previous address", "Employer's phone"
   - Any field with qualifiers: "of", "previous", "former", "at time of", "before"
   - Third-party information: spouse's name, employer's address, etc.
   
4. FILE_UPLOAD - Document or file upload requests:
   - "Upload receipt", "Attach proof", "Upload documentation"
   - Any field with type="file" or mentions upload/attach/document
   
5. USER_QUESTION - Open-ended questions requiring typed input:
   - "Describe the issue", "Explain your situation", "Additional comments"
   - Free-text fields asking for descriptions or explanations
   - For these, provide a SPECIFIC promptForUser that tells the user exactly what to enter
   
6. SKIP - Optional or non-essential fields:
   - Fields marked "(optional)"
   - "Referral code", "How did you hear about us?", "Middle name (optional)"

CRITICAL RULES:
1. STANDARD_PROFILE is a STRICT WHITELIST. If unsure, do NOT classify as STANDARD_PROFILE.
2. Any field about money, prices, commissions, fees, amounts = CASE_ANSWER (never STANDARD_PROFILE)
3. Any field with qualifiers (previous, former, of home sold, etc.) = CONTEXTUAL_DATA
4. For USER_QUESTION, write a SPECIFIC prompt telling the user exactly what format/info to provide
5. When in doubt between STANDARD_PROFILE and CASE_ANSWER, choose CASE_ANSWER

For suggestedKey: Match to the closest available key from userData (for STANDARD_PROFILE) or caseAnswers (for CASE_ANSWER/CONTEXTUAL_DATA).

For promptForUser (USER_QUESTION only): Write a specific, helpful prompt like:
- "Enter the approximate sale price of your home in dollars (e.g., $350,000)"
- "Describe the issue you experienced with the product in 2-3 sentences"
- "Enter the name of the brokerage firm that listed your property"

Respond with a JSON object containing a "classifications" array.`;

/**
 * POST /api/autofill/triage-fields
 * Batch classify form fields using LLM
 */
app.post("/api/autofill/triage-fields", async (req, res) => {
  try {
    const { fields, availableUserDataKeys, availableCaseAnswerKeys, caseAnswerMeta } = req.body;

    if (!fields || !Array.isArray(fields)) {
      return res.status(400).json({ error: "fields array is required" });
    }

    // If OpenAI is not configured, use fallback heuristics
    if (!openai) {
      console.log("[Triage] Using fallback heuristics (no OpenAI key)");
      const classifications = fields.map(field => classifyFieldHeuristic(field, availableUserDataKeys, availableCaseAnswerKeys));
      return res.json({ classifications, method: "heuristic" });
    }

    // Build the prompt with field information
    const fieldsDescription = fields.map((f, i) => 
      `${i + 1}. Field ID: "${f.id || 'unnamed'}"
   Label: "${f.label || 'no label'}"
   Type: "${f.type || 'text'}"
   Required: ${f.required ? 'yes' : 'no'}
   Context: "${f.context || ''}"
   Placeholder: "${f.placeholder || ''}"`
    ).join("\n\n");

    const userPrompt = `Classify these form fields:

${fieldsDescription}

Available userData keys: ${JSON.stringify(availableUserDataKeys || [])}
Available caseAnswers keys: ${JSON.stringify(availableCaseAnswerKeys || [])}
Case answer descriptions: ${JSON.stringify(caseAnswerMeta || {})}

Respond with a JSON array like:
[
  { "fieldId": "field1", "category": "STANDARD_PROFILE", "suggestedKey": "firstName", "confidence": 0.95 },
  { "fieldId": "field2", "category": "CONTEXTUAL_DATA", "suggestedKey": "addressOfHomeSold", "confidence": 0.9 },
  { "fieldId": "field3", "category": "USER_QUESTION", "promptForUser": "Please describe the issue you experienced", "confidence": 0.85 }
]`;

    console.log(`[Triage] Classifying ${fields.length} fields with OpenAI`);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: TRIAGE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1, // Low temperature for consistent classification
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(responseText);
      // Handle both array and object with classifications key
      const classifications = Array.isArray(parsed) ? parsed : (parsed.classifications || []);
      
      console.log(`[Triage] Successfully classified ${classifications.length} fields`);
      return res.json({ classifications, method: "llm" });
    } catch (parseError) {
      console.error("[Triage] Failed to parse LLM response:", parseError);
      console.error("[Triage] Raw response:", responseText);
      
      // Fall back to heuristics
      const classifications = fields.map(field => classifyFieldHeuristic(field, availableUserDataKeys, availableCaseAnswerKeys));
      return res.json({ classifications, method: "heuristic-fallback" });
    }

  } catch (error) {
    console.error("[Triage] Error:", error);
    
    // Fall back to heuristics on any error
    const { fields, availableUserDataKeys, availableCaseAnswerKeys } = req.body;
    if (fields && Array.isArray(fields)) {
      const classifications = fields.map(field => classifyFieldHeuristic(field, availableUserDataKeys, availableCaseAnswerKeys));
      return res.json({ classifications, method: "heuristic-error-fallback", error: error.message });
    }
    
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Heuristic fallback for field classification when LLM is not available
 */
function classifyFieldHeuristic(field, availableUserDataKeys = [], availableCaseAnswerKeys = []) {
  const label = (field.label || "").toLowerCase();
  const type = (field.type || "text").toLowerCase();
  const context = (field.context || "").toLowerCase();
  const fullText = `${label} ${context}`;

  // File upload detection
  if (type === "file" || /upload|attach|document|proof|receipt/i.test(fullText)) {
    return {
      fieldId: field.id,
      category: "FILE_UPLOAD",
      confidence: 0.9
    };
  }

  // Contextual data detection - look for qualifiers
  const contextualPatterns = [
    /address of (?:home|property|house) sold/i,
    /previous address/i,
    /former address/i,
    /employer'?s? (?:phone|address|name)/i,
    /spouse'?s? (?:name|phone|email)/i,
    /at (?:the )?time of/i,
    /before the/i,
    /prior to/i,
    /maiden name/i,
    /birth (?:city|country|place)/i,
  ];
  
  if (contextualPatterns.some(p => p.test(fullText))) {
    return {
      fieldId: field.id,
      category: "CONTEXTUAL_DATA",
      confidence: 0.85
    };
  }

  // Case answer detection - questions
  const questionPatterns = [
    /did you/i,
    /do you have/i,
    /have you/i,
    /were you/i,
    /are you/i,
    /was the/i,
    /\?$/,
    /select (?:all|one|yes|no)/i,
  ];
  
  if (questionPatterns.some(p => p.test(fullText))) {
    return {
      fieldId: field.id,
      category: "CASE_ANSWER",
      confidence: 0.8
    };
  }

  // User question detection - open-ended
  const userQuestionPatterns = [
    /describe/i,
    /explain/i,
    /additional comments/i,
    /tell us about/i,
    /please provide details/i,
  ];
  
  if (userQuestionPatterns.some(p => p.test(fullText))) {
    return {
      fieldId: field.id,
      category: "USER_QUESTION",
      promptForUser: field.label || "Please provide additional information",
      confidence: 0.8
    };
  }

  // Skip detection - optional fields
  if (/optional/i.test(fullText) || /referral|how did you hear/i.test(fullText)) {
    return {
      fieldId: field.id,
      category: "SKIP",
      confidence: 0.85
    };
  }

  // Standard profile detection - match against known keys
  const standardProfileMatches = {
    "first name": "firstName",
    "last name": "lastName",
    "full name": "fullName",
    "email": "email",
    "e-mail": "email",
    "phone": "phone",
    "telephone": "phone",
    "street address": "address.street",
    "mailing address": "address.street",
    "address line 1": "address.street",
    "address line 2": "address.unit",
    "apt": "address.unit",
    "apartment": "address.unit",
    "unit": "address.unit",
    "suite": "address.unit",
    "city": "address.city",
    "state": "address.state",
    "zip": "address.zip",
    "zip code": "address.zip",
    "postal code": "address.zip",
    "country": "address.country",
    "date of birth": "dateOfBirth",
    "birthday": "dateOfBirth",
    "dob": "dateOfBirth",
  };

  for (const [pattern, key] of Object.entries(standardProfileMatches)) {
    if (label.includes(pattern) || label === pattern) {
      return {
        fieldId: field.id,
        category: "STANDARD_PROFILE",
        suggestedKey: key,
        confidence: 0.85
      };
    }
  }

  // Default: if required, treat as user question; otherwise skip
  if (field.required) {
    return {
      fieldId: field.id,
      category: "USER_QUESTION",
      promptForUser: field.label || "Please provide this information",
      confidence: 0.5
    };
  }

  return {
    fieldId: field.id,
    category: "SKIP",
    confidence: 0.5
  };
}

const port = process.env.PORT || 5171;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
