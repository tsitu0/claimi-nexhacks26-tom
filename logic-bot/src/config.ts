export const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  port: process.env.PORT || 3001,
  serverName: process.env.SERVER_NAME || 'claimi-logic-bot',
  serverVersion: process.env.SERVER_VERSION || '1.0.0',
};

