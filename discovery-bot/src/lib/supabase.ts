import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SettlementData } from '../types/settlement';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

/**
 * Get or create Supabase client
 */
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    }
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

/**
 * Initialize Supabase client (call at startup)
 */
export function initSupabase(url?: string, key?: string): SupabaseClient {
  const finalUrl = url || supabaseUrl;
  const finalKey = key || supabaseKey;
  
  if (!finalUrl || !finalKey) {
    throw new Error('Supabase URL and key are required');
  }
  
  supabase = createClient(finalUrl, finalKey);
  return supabase;
}

/**
 * Store a discovered settlement in Supabase
 */
export async function storeSettlement(settlement: SettlementData): Promise<{ id: string } | null> {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('settlements')
    .upsert({
      ...settlement,
      eligibility_rules: settlement.eligibility_rules,
      citations: settlement.citations,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'source_url'
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error storing settlement:', error);
    throw error;
  }

  return data;
}

/**
 * Get all settlements from Supabase
 */
export async function getSettlements(status?: string): Promise<SettlementData[]> {
  const client = getSupabase();
  
  let query = client.from('settlements').select('*');
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching settlements:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a single settlement by ID
 */
export async function getSettlementById(id: string): Promise<SettlementData | null> {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('settlements')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching settlement:', error);
    return null;
  }

  return data;
}

/**
 * Check if a settlement URL already exists
 */
export async function settlementExists(sourceUrl: string): Promise<boolean> {
  const client = getSupabase();
  
  const { data, error } = await client
    .from('settlements')
    .select('id')
    .eq('source_url', sourceUrl)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking settlement:', error);
  }

  return !!data;
}

/**
 * SQL to create the settlements table in Supabase
 * Run this in your Supabase SQL editor
 */
export const SETTLEMENTS_TABLE_SQL = `
-- Create settlements table
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  provider TEXT,
  case_name TEXT,
  description TEXT,
  settlement_amount TEXT,
  deadline DATE,
  eligibility_rules JSONB NOT NULL DEFAULT '{}',
  citations JSONB NOT NULL DEFAULT '[]',
  claim_url TEXT,
  source_url TEXT UNIQUE NOT NULL,
  raw_content TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on source_url for fast lookups
CREATE INDEX IF NOT EXISTS idx_settlements_source_url ON settlements(source_url);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);

-- Create index on deadline for finding active settlements
CREATE INDEX IF NOT EXISTS idx_settlements_deadline ON settlements(deadline);

-- Create index on provider for searching by company
CREATE INDEX IF NOT EXISTS idx_settlements_provider ON settlements(provider);

-- Enable Row Level Security
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust for your auth needs)
CREATE POLICY "Allow all operations" ON settlements
  FOR ALL
  USING (true)
  WITH CHECK (true);
`;

/**
 * SQL to add new columns to existing table (run if table already exists)
 */
export const ADD_NEW_COLUMNS_SQL = `
-- Add new columns to existing settlements table
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS case_name TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS settlement_amount TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS claim_form_info JSONB;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS has_valid_form BOOLEAN DEFAULT false;

-- Create index on provider
CREATE INDEX IF NOT EXISTS idx_settlements_provider ON settlements(provider);

-- Create index on has_valid_form for filtering
CREATE INDEX IF NOT EXISTS idx_settlements_has_valid_form ON settlements(has_valid_form);
`;

