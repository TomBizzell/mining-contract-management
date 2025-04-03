import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.3.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://yowihgrlmntraktvruve.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = new Date().toISOString();
  
  // Log request details
  console.log('='.repeat(80));
  console.log(`[${requestId}] Edge function invocation started at ${startTime}`);
  console.log(`[${requestId}] Request method: ${req.method}`);
  console.log(`[${requestId}] Request URL: ${req.url}`);
  console.log(`[${requestId}] Request headers:`, Object.fromEntries(req.headers.entries()));
  
  // Add a test endpoint
  if (req.url.endsWith('/test')) {
    console.log(`[${requestId}] Test endpoint called`);
    return new Response(
      JSON.stringify({ 
        status: 'ok',
        message: 'Edge function is running',
        timestamp: new Date().toISOString(),
        environment: {
          hasOpenAIKey: !!OPENAI_API_KEY,
          hasSupabaseUrl: !!SUPABASE_URL,
          hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] Handling CORS preflight request`);
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify request has authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log(`[${requestId}] No authorization header provided`);
      return new Response(
        JSON.stringify({ error: 'No authorization header provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key for admin access
    console.log(`[${requestId}] Initializing Supabase client`);
    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY ?? ''
    );

    // Get all pending documents that haven't been processed yet
    console.log(`[${requestId}] Fetching all pending documents`);
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .filter('status', 'eq', 'pending')
      .filter('openai_file_id', 'is', null)
      .execute();

    if (docError) {
      console.error(`[${requestId}] Error fetching documents:`, docError);
      throw new Error(`Error fetching documents: ${docError.message}`);
    }

    console.log(`[${requestId}] Found ${documents.length} pending documents to process`);
    if (documents.length === 0) {
      console.log(`[${requestId}] No pending documents found`);
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No pending documents found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process each document in sequence
    const results = [];
    for (const doc of documents) {
      console.log(`[${requestId}] Starting processing for document: ${doc.id} (${doc.filename}) for user: ${doc.user_id}`);
      const result = await processDocument(supabaseAdmin, doc);
      
      // After uploading to OpenAI Files API, analyze the document
      if (result.status === 'processed' && result.openai_file_id) {
        console.log(`[${requestId}] Document ${doc.id} processed successfully, starting analysis`);
        await analyzeDocument(supabaseAdmin, result.documentId, result.openai_file_id, doc.party);
      } else {
        console.log(`[${requestId}] Document ${doc.id} processing status: ${result.status}`);
        if (result.error) {
          console.error(`[${requestId}] Document ${doc.id} processing error:`, result.error);
        }
      }
      
      results.push(result);
    }

    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    console.log(`[${requestId}] Edge function completed successfully at ${endTime}`);
    console.log(`[${requestId}] Total processing time: ${duration}ms`);
    console.log(`[${requestId}] Processed ${results.length} documents`);
    console.log('='.repeat(80));

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length, 
        results,
        duration_ms: duration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    console.error(`[${requestId}] Edge function error at ${endTime}`);
    console.error(`[${requestId}] Error details:`, error);
    console.error(`[${requestId}] Error stack:`, error.stack);
    console.error(`[${requestId}] Total execution time: ${duration}ms`);
    console.error('='.repeat(80));

    return new Response(
      JSON.stringify({ 
        error: error.message,
        duration_ms: duration
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processDocument(supabaseAdmin: any, document: any) {
  let uploadedFileId: string | null = null;
  try {
    console.log(`[${document.id}] Starting document processing: ${document.filename}`);

    // Get file from storage bucket
    console.log(`[${document.id}] Downloading file from Supabase storage: ${document.file_path}`);
    const { data: fileData, error: fileError } = await supabaseAdmin.storage
      .from('contracts')
      .download(document.file_path);

    if (fileError) {
      console.error(`[${document.id}] Error downloading file:`, fileError);
      throw new Error(`Error downloading file: ${fileError.message}`);
    }

    console.log(`[${document.id}] File downloaded successfully, size: ${fileData.length} bytes`);

    // Convert file to FormData for OpenAI Files API
    const formData = new FormData();
    formData.append('purpose', 'user_data');
    formData.append('file', new File([fileData], document.filename, { type: 'application/pdf' }));

    // Submit file to OpenAI Files API
    console.log(`[${document.id}] Uploading file to OpenAI Files API`);
    const openAIResponse = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    const openAIData = await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error(`[${document.id}] OpenAI API error:`, openAIData);
      throw new Error(`OpenAI API error: ${JSON.stringify(openAIData)}`);
    }

    uploadedFileId = openAIData.id;
    console.log(`[${document.id}] OpenAI file uploaded successfully: ${uploadedFileId}`);

    // Update document record with OpenAI file ID
    console.log(`[${document.id}] Updating document record in Supabase`);
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        openai_file_id: uploadedFileId,
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', document.id);

    if (updateError) {
      console.error(`[${document.id}] Error updating document:`, updateError);
      throw new Error(`Error updating document: ${updateError.message}`);
    }

    return {
      status: 'processed',
      documentId: document.id,
      openai_file_id: uploadedFileId,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
    };
  }
}

async function analyzeDocument(supabaseAdmin: any, documentId: string, openai_file_id: string, party: string) {
  // Implementation of analyzeDocument function
}

async function createClient(url: string, serviceRoleKey: string) {
  // Implementation of createClient function
}