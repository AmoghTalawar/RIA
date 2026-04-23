# Implementation Plan: Text-to-SQL Tool for RIA Dashboard

The goal is to enhance the existing `AIChatbot.jsx` with a "Text-to-SQL" tool. This will allow the AI to move beyond the static JSON query logic and perform complex, live database queries using the Groq API's tool-calling capabilities.

## User Review Required

> [!IMPORTANT]
> **Supabase Credentials**:
> URL: `http://127.0.0.1:54321`
> Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0` (Local Supabase instance).
> **SQL Safety**: The tool is restricted to `SELECT` queries to ensure data integrity during experimentation.

## Proposed Changes

### [Core Infrastructure]

#### [NEW] [supabaseClient.js](file:///c:/Users/Lenovo/Downloads/RIA-Dashboard-L1-Interface%28ChatBot%29/ria-dashboard/src/supabaseClient.js)
Initializes the Supabase client using environment variables.

#### [NEW] [sqlTool.js](file:///c:/Users/Lenovo/Downloads/RIA-Dashboard-L1-Interface%28ChatBot%29/ria-dashboard/src/tools/sqlTool.js)
- Contains the Tool Definition (Name, Description, Parameters).
- Includes the SQL Execution logic using the Supabase client.
- Provides a summary of the database schema (Tables, Columns, Types) to be injected into the system prompt.

### [Chatbot Integration]

#### [MODIFY] [AIChatbot.jsx](file:///c:/Users/Lenovo/Downloads/RIA-Dashboard-L1-Interface%28ChatBot%29/ria-dashboard/src/components/AIChatbot.jsx)
- Update the `callGroq` function to include the `tools` parameter in the request body.
- Implement the "Tool Use Loop":
  1. Send message to Groq.
  2. If Groq returns a `tool_calls` array:
     a. Execute the SQL tool for each call.
     b. Append the tool results to the conversation.
     c. Send the updated conversation back to Groq for a final natural language response.
- Update the system prompt to explain the schema and how to use the `execute_sql` tool.

## Open Questions

- **Live Database**: User confirmed local Supabase setup.
- **Tool Logic**: We will move to a hybrid approach—using the SQL tool for complex data queries and retaining JSON search for quick metadata lookups if needed.

## Verification Plan

### Automated Tests
- No automated tests currently exist for the UI components. I will verify via browser inspection.

### Manual Verification
1. Ask the chatbot: "How many faculty members are there in the CSE department?"
2. Verify the `execute_sql` tool is called with `SELECT count(*) FROM faculty JOIN departments ...`.
3. Verify the final response matches the database state.
4. Test a complex query: "Who are the top 5 faculty members by Scopus citations in 2024?"
