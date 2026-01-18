import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ParsedRequirements, SettlementInput } from '../types';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

export function initSupabase(url: string, key: string): SupabaseClient {
  supabase = createClient(url, key);
  return supabase;
}

/**
 * Get settlements that haven't been parsed by logic bot yet
 */
export async function getUnparsedSettlements(): Promise<SettlementInput[]> {
  const client = getSupabase();
  
  // Get settlements that don't have a corresponding parsed_requirements entry
  const { data: settlements, error } = await client
    .from('settlements')
    .select('id, title, provider, deadline, eligibility_rules, citations')
    .eq('status', 'discovered')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching settlements:', error);
    return [];
  }
  
  // Filter out ones that are already parsed
  const { data: parsed } = await client
    .from('parsed_requirements')
    .select('settlement_id');
  
  const parsedIds = new Set((parsed || []).map(p => p.settlement_id));
  
  return (settlements || []).filter(s => !parsedIds.has(s.id)) as SettlementInput[];
}

/**
 * Get a specific settlement by ID
 */
export async function getSettlementById(id: string): Promise<SettlementInput | null> {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('settlements')
    .select('id, title, provider, deadline, eligibility_rules, citations')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error('Error fetching settlement:', error);
    return null;
  }
  
  return data as SettlementInput;
}

/**
 * Store parsed requirements
 */
export async function storeParsedRequirements(parsed: ParsedRequirements): Promise<{ id: string } | null> {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('parsed_requirements')
    .upsert({
      settlement_id: parsed.settlement_id,
      settlement_title: parsed.settlement_title,
      general_requirements: parsed.general_requirements,
      specific_requirements: parsed.specific_requirements,
      onboarding_questions: parsed.onboarding_questions,
      proof_checklist: parsed.proof_checklist,
      parsing_confidence: parsed.parsing_confidence,
      parsing_notes: parsed.parsing_notes,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'settlement_id'
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Error storing parsed requirements:', error);
    throw error;
  }
  
  // Update settlement status to 'parsed'
  await client
    .from('settlements')
    .update({ status: 'parsed', updated_at: new Date().toISOString() })
    .eq('id', parsed.settlement_id);
  
  return data;
}

/**
 * Get parsed requirements by settlement ID
 */
export async function getParsedRequirements(settlementId: string): Promise<ParsedRequirements | null> {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('parsed_requirements')
    .select('*')
    .eq('settlement_id', settlementId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching parsed requirements:', error);
    return null;
  }
  
  return data as ParsedRequirements | null;
}

/**
 * List all parsed requirements
 */
export async function listParsedRequirements(): Promise<ParsedRequirements[]> {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('parsed_requirements')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error listing parsed requirements:', error);
    return [];
  }
  
  return data as ParsedRequirements[];
}

/**
 * SQL to create the parsed_requirements table
 */
export const PARSED_REQUIREMENTS_TABLE_SQL = `
-- Create parsed_requirements table for logic bot output
CREATE TABLE IF NOT EXISTS parsed_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID UNIQUE NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  settlement_title TEXT NOT NULL,
  general_requirements JSONB NOT NULL DEFAULT '[]',
  specific_requirements JSONB NOT NULL DEFAULT '[]',
  onboarding_questions JSONB NOT NULL DEFAULT '[]',
  proof_checklist JSONB NOT NULL DEFAULT '[]',
  parsing_confidence DECIMAL(3,2) DEFAULT 0.0,
  parsing_notes JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_parsed_requirements_settlement_id ON parsed_requirements(settlement_id);
CREATE INDEX IF NOT EXISTS idx_parsed_requirements_confidence ON parsed_requirements(parsing_confidence);

-- Enable RLS
ALTER TABLE parsed_requirements ENABLE ROW LEVEL SECURITY;

-- Allow all operations (for hackathon)
CREATE POLICY "Allow all operations" ON parsed_requirements
  FOR ALL USING (true) WITH CHECK (true);
`;

