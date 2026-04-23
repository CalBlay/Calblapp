import axios from "axios";
import { getEvents } from "./webapp.service.js";
import {
  getPurchasesBySupplier,
  listFinanceCsvFiles,
  previewFinanceCsv
} from "./finances.service.js";

function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return { apiKey, model };
}

function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "events_count_by_year",
        description: "Get number of events in a given year",
        parameters: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 2000, maximum: 2100 }
          },
          required: ["year"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "finances_list_files",
        description: "List available finance CSV files",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "finances_preview_file",
        description: "Preview a finance CSV file",
        parameters: {
          type: "object",
          properties: {
            file: { type: "string" },
            rows: { type: "integer", minimum: 1, maximum: 200 }
          },
          required: ["file"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_by_supplier",
        description: "Search purchases rows by supplier name",
        parameters: {
          type: "object",
          properties: {
            supplierName: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 500 }
          },
          required: ["supplierName"]
        }
      }
    }
  ];
}

async function runTool(toolName, args) {
  if (toolName === "events_count_by_year") {
    const year = Number(args?.year);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const events = await getEvents({ from, to, limit: 5000 });
    return { year, count: events.length };
  }
  if (toolName === "finances_list_files") {
    const files = await listFinanceCsvFiles();
    return { count: files.length, files };
  }
  if (toolName === "finances_preview_file") {
    return previewFinanceCsv(String(args?.file || ""), Number(args?.rows || 20));
  }
  if (toolName === "purchases_by_supplier") {
    return getPurchasesBySupplier(String(args?.supplierName || ""), Number(args?.limit || 200));
  }
  throw new Error(`Unknown tool: ${toolName}`);
}

export async function chatWithTools({ question, language = "ca" }) {
  const { apiKey, model } = getOpenAiConfig();
  const tools = buildTools();

  const messages = [
    {
      role: "system",
      content:
        "You are a financial and operations assistant for Cal Blay. Use tools for factual answers. " +
        "When user asks for chart, return JSON with chartData: {type, labels, datasets}. " +
        "Answer in the requested language when possible."
    },
    {
      role: "user",
      content: `language=${language}\nquestion=${question}`
    }
  ];

  for (let step = 0; step < 5; step += 1) {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    const choice = response.data?.choices?.[0]?.message;
    if (!choice) throw new Error("No response from OpenAI");

    messages.push(choice);

    const toolCalls = choice.tool_calls || [];
    if (!toolCalls.length) {
      return {
        model,
        answer: choice.content || "",
        toolCallsUsed: messages.filter((m) => m.role === "tool").length
      };
    }

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      const args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      const result = await runTool(name, args);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name,
        content: JSON.stringify(result)
      });
    }
  }

  throw new Error("Tool loop exceeded maximum steps");
}

