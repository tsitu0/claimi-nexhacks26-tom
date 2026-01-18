import { Tool, Resource, Prompt } from "@leanmcp/core";

/**
 * Input class for text analysis tool
 */
class AnalyzeTextInput {
  text!: string;
  analysisType?: string;
}

/**
 * Input class for data query tool
 */
class QueryDataInput {
  query!: string;
  filters?: Record<string, any>;
}

/**
 * AI Agent Service
 * Provides tools, resources, and prompts for the AI agent
 */
export class AIAgentService {
  /**
   * Tool: Analyze text
   * Performs various types of text analysis
   */
  @Tool({
    description: "Analyze text for sentiment, keywords, summary, or other analysis types",
    inputClass: AnalyzeTextInput,
  })
  async analyzeText(input: AnalyzeTextInput) {
    const { text, analysisType = "summary" } = input;

    // Example implementation - you can integrate with actual AI services
    let result: any = {
      text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
      analysisType,
      timestamp: new Date().toISOString(),
    };

    switch (analysisType) {
      case "sentiment":
        result.sentiment = "positive"; // Replace with actual sentiment analysis
        result.confidence = 0.85;
        break;
      case "keywords":
        result.keywords = text.split(/\s+/).slice(0, 10); // Simple keyword extraction
        break;
      case "summary":
      default:
        result.summary = text.length > 200 ? text.substring(0, 200) + "..." : text;
        break;
    }

    return result;
  }

  /**
   * Tool: Query data
   * Queries data based on provided query and filters
   */
  @Tool({
    description: "Query and retrieve data based on a query string and optional filters",
    inputClass: QueryDataInput,
  })
  async queryData(input: QueryDataInput) {
    const { query, filters = {} } = input;

    // Example implementation - replace with actual data query logic
    return {
      query,
      filters,
      results: [
        {
          id: "1",
          data: "Sample result based on query",
          relevance: 0.95,
        },
      ],
      count: 1,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Tool: Process claim
   * Processes insurance claims or similar documents
   */
  @Tool({
    description: "Process and analyze a claim document or claim data",
    inputClass: AnalyzeTextInput,
  })
  async processClaim(input: AnalyzeTextInput) {
    const { text } = input;

    // Example claim processing
    return {
      claimId: `CLM-${Date.now()}`,
      status: "processed",
      extractedData: {
        amount: null,
        date: new Date().toISOString(),
        description: text.substring(0, 200),
      },
      confidence: 0.92,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Resource: Agent capabilities
   * Provides information about what the agent can do
   */
  @Resource({
    description: "Information about the AI agent's capabilities and available tools",
    mimeType: "application/json",
  })
  async getAgentCapabilities() {
    return {
      capabilities: [
        "Text analysis (sentiment, keywords, summary)",
        "Data querying and retrieval",
        "Claim processing and analysis",
      ],
      version: "1.0.0",
      availableTools: ["analyzeText", "queryData", "processClaim"],
    };
  }

  /**
   * Prompt: Default system prompt
   */
  @Prompt({
    description: "Default system prompt for the AI agent",
  })
  getSystemPrompt() {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `You are a helpful AI agent powered by LeanMCP. You can:
- Analyze text for sentiment, keywords, or summaries
- Query and retrieve data
- Process claims and documents

Always be helpful, accurate, and provide clear responses.`
        }
      }]
    };
  }
}

