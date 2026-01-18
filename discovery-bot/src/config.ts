export const config = {
  // LeanMCP
  leanMCPApiKey: process.env.LEANMCP_API_KEY || 'leanmcp_db38bafe8ec19b533614a27c06f23451a98913035885e01f6559ff2146b8b89d',
  port: process.env.PORT || 3000,
  serverName: process.env.SERVER_NAME || 'claimi-discovery-agent',
  serverVersion: process.env.SERVER_VERSION || '1.0.0',
  
  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  
  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',
};

