
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

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
      .eq('status', 'pending')
      .is('openai_file_id', null);

    if (docError) {
      console.error(`[${requestId}] Error fetching documents:`, docError);
      throw new Error(`Error fetching documents: ${docError.message}`);
    }

    console.log(`[${requestId}] Found ${documents?.length} pending documents to process`);
    if (!documents || documents.length === 0) {
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

async function processDocument(supabaseAdmin, document) {
  let uploadedFileId = null;
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
    console.error(`[${document.id}] Error processing document:`, error);
    
    // Update document status to error
    try {
      await supabaseAdmin
        .from('documents')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);
    } catch (updateError) {
      console.error(`[${document.id}] Error updating document status to error:`, updateError);
    }
    
    return {
      status: 'error',
      documentId: document.id,
      error: error.message,
    };
  }
}

async function analyzeDocument(supabaseAdmin, documentId, openai_file_id, party) {
  try {
    console.log(`[${documentId}] Starting document analysis with OpenAI`);
    
    // Call OpenAI API to analyze the document
    const analysisResponse = await fetch('https://api.openai.com/v1/threads/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'
      },
      body: JSON.stringify({
        assistant_id: "asst_abc123", // Replace with your Assistant ID
        thread: {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are a contract manager for ${party}. Extract the key obligations that ${party} has under the contract. If an obligation is time-based, the due date should be extracted too. Output ONLY a JSON array with each obligation containing 'obligation', 'section', and 'dueDate' fields.`
                },
                {
                  type: "file_attachment",
                  file_id: openai_file_id
                }
              ]
            }
          ]
        }
      })
    });

    if (!analysisResponse.ok) {
      const errorData = await analysisResponse.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
    }

    const analysisData = await analysisResponse.json();
    console.log(`[${documentId}] Analysis submitted to OpenAI, run ID: ${analysisData.id}`);
    
    // Wait for the run to complete and get results
    let runStatus = 'queued';
    let runResult = null;
    
    while (['queued', 'in_progress'].includes(runStatus)) {
      // Wait before checking status again
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/runs/${analysisData.id}`, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      
      if (!statusResponse.ok) {
        const errorData = await statusResponse.json();
        throw new Error(`Error checking run status: ${JSON.stringify(errorData)}`);
      }
      
      const statusData = await statusResponse.json();
      runStatus = statusData.status;
      console.log(`[${documentId}] Current run status: ${runStatus}`);
      
      if (runStatus === 'completed') {
        // Get the messages from the thread
        const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${analysisData.thread_id}/messages`, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v1'
          }
        });
        
        if (!messagesResponse.ok) {
          const errorData = await messagesResponse.json();
          throw new Error(`Error fetching messages: ${JSON.stringify(errorData)}`);
        }
        
        const messagesData = await messagesResponse.json();
        // Get the first assistant message
        const assistantMessage = messagesData.data.find(msg => msg.role === 'assistant');
        
        if (assistantMessage) {
          runResult = assistantMessage.content[0].text.value;
        }
      } else if (['failed', 'cancelled', 'expired'].includes(runStatus)) {
        throw new Error(`Run ended with status: ${runStatus}`);
      }
    }
    
    // Process the results
    let obligations = [];
    
    if (runResult) {
      try {
        // Try to parse the JSON data from the response
        // Extract just the JSON part if there's additional text
        const jsonMatch = runResult.match(/\[.*\]/s);
        if (jsonMatch) {
          obligations = JSON.parse(jsonMatch[0]);
        } else {
          // If no JSON array found, store the raw response
          obligations = [{
            obligation: "Raw AI response (parsing failed)",
            section: "N/A",
            raw_response: runResult
          }];
        }
      } catch (parseError) {
        console.error(`[${documentId}] Error parsing analysis results:`, parseError);
        obligations = [{
          obligation: "Error parsing AI response",
          section: "N/A",
          raw_response: runResult
        }];
      }
    }

    // Update document with analysis results
    console.log(`[${documentId}] Updating document with analysis results`);
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        status: 'analyzed',
        analysis_results: obligations,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Error updating document with analysis: ${updateError.message}`);
    }

    console.log(`[${documentId}] Document analysis completed successfully`);
    return {
      status: 'success',
      documentId
    };
  } catch (error) {
    console.error(`[${documentId}] Error analyzing document:`, error);
    
    // Update document status to error
    try {
      await supabaseAdmin
        .from('documents')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);
    } catch (updateError) {
      console.error(`[${documentId}] Error updating document status to error:`, updateError);
    }
    
    return {
      status: 'error',
      documentId,
      error: error.message
    };
  }
}
