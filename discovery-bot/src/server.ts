import "dotenv/config";
import { MCPServer, createHTTPServer } from "@leanmcp/core";
import { config } from "./config";
import { initSupabase } from "./lib/supabase";
import { DiscoveryService } from "./services/discovery.service";

/**
 * Main MCP Server
 * Sets up and starts the LeanMCP server with Settlement Discovery Agent
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

  // Create MCP server with manual service registration
  const serverFactory = async () => {
    const server = new MCPServer({
      name: config.serverName,
      version: config.serverVersion,
      autoDiscover: false,
    });
    
    // Register the Discovery Service
    server.registerService(new DiscoveryService());
    console.log('✅ Discovery Service registered');
    
    return server.getServer();
  };

  // Create and start HTTP server
  await createHTTPServer(serverFactory, {
    port: Number(config.port),
    cors: true,
  });

  console.log(`
🚀 Claimi Settlement Discovery Agent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Server: ${config.serverName} v${config.serverVersion}
🌐 MCP Endpoint: http://localhost:${config.port}/mcp
🏥 Health Check: http://localhost:${config.port}/health
📊 Dashboard: http://localhost:${config.port}/

🔧 Available Tools:
  • discoverSettlement     - Scrape & parse a settlement URL
  • batchDiscoverSettlements - Process multiple URLs
  • getSettlement          - Get settlement by ID
  • listSettlements        - List all discovered settlements

💡 Example usage with MCP client:
   Call 'discoverSettlement' with:
   { "url": "https://example.com/settlement-page" }
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

// Run server
main().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});

