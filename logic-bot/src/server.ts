import "dotenv/config";
import { createHTTPServer, MCPServer } from "@leanmcp/core";
import { config } from "./config";
import { initSupabase } from "./lib/supabase";
import { LogicService } from "./services/logic.service";

/**
 * Logic Bot MCP Server
 * Parses settlement requirements into general vs specific categories
 */
async function main() {
  // Validate required environment variables
  const missingVars: string[] = [];
  if (!config.supabaseUrl) missingVars.push('SUPABASE_URL');
  if (!config.supabaseAnonKey) missingVars.push('SUPABASE_ANON_KEY');
  if (!config.openaiApiKey) missingVars.push('OPENAI_API_KEY');

  if (missingVars.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
    console.warn('   Some features may not work without these configured.');
  } else {
    // Initialize Supabase
    initSupabase(config.supabaseUrl, config.supabaseAnonKey);
    console.log('✅ Supabase initialized');
  }

  // Create MCPServer instance
  const server = new MCPServer({
    name: config.serverName,
    version: config.serverVersion,
    logging: true,
    autoDiscover: false,
  });

  // Register the Logic Service
  server.registerService(new LogicService());
  console.log('✅ Logic Service registered');

  // Create and start HTTP server
  await createHTTPServer(() => server.getServer(), {
    port: Number(config.port),
    cors: true,
    logging: true,
  });

  console.log(`
🧠 Claimi Logic Bot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Server: ${config.serverName} v${config.serverVersion}
🌐 MCP Endpoint: http://localhost:${config.port}/mcp
🏥 Health Check: http://localhost:${config.port}/health

🔧 Available Tools:
  • parseSettlement      - Parse a settlement's requirements
  • parseAllUnparsed     - Process all unparsed settlements
  • getParsedRequirements - Get parsed data by settlement ID
  • listParsed           - List all parsed requirements
  • getUnparsed          - List settlements awaiting parsing

📊 Requirement Categories:
  GENERAL (onboarding):
    • demographic - age, gender, occupation
    • location    - state, country, region
    • account     - customer/member status
    • timeframe   - date ranges
  
  SPECIFIC (needs proof):
    • purchase    - receipts, orders
    • usage       - product/feature usage
    • transaction - payment records
    • document    - contracts, notices
    • action      - complaints, requests

💡 Example usage with MCP client:
   Call 'parseSettlement' with:
   { "settlement_id": "uuid-from-discovery-bot" }
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

// Run server
main().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});

