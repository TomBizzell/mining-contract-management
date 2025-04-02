# Contract Compass Extract

A web application for extracting and managing contract obligations.

## Fixing Contract Processing Workflow

If you're experiencing issues with the contract processing workflow, follow these steps:

### 1. Deploy the Updated Edge Function

The edge function has been updated to fix issues with the Supabase client implementation. The updated version now properly supports multiple filter conditions. Deploy it to your Supabase project:

```bash
supabase functions deploy process-documents
```

### 2. Check Logs for Errors

After uploading a new contract, check the edge function logs for errors:

```bash
supabase functions logs process-documents
```

### 3. Common Issues and Solutions

- **Multiple .eq() Calls**: The original Supabase client implementation didn't support chaining multiple `.eq()` calls. This has been fixed by using a new `.filter()` approach.

- **JSON Parsing Errors**: The OpenAI API may not always return valid JSON. The edge function will now store the raw response in the `analysis_results` field with a `raw_response` key if parsing fails.
  
- **Empty Results**: If the contract analysis doesn't find any obligations, it will still save an empty array to `analysis_results`.

- **Authentication Issues**: Make sure your Supabase and OpenAI API keys are correctly set in the environment variables.

## Development

### Prerequisites

- Node.js
- Supabase CLI
- OpenAI API key

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your API keys
4. Start the development server: `npm run dev`

## Deployment

1. Build the application: `npm run build`
2. Deploy to your hosting provider of choice
3. Set up the required environment variables

## Environment Variables

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `OPENAI_API_KEY`: Your OpenAI API key

## License

[MIT](LICENSE)
