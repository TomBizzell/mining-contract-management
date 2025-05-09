import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://yowihgrlmntraktvruve.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
serve(async (req)=>{
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
    return new Response(JSON.stringify({
      status: 'ok',
      message: 'Edge function is running',
      timestamp: new Date().toISOString(),
      environment: {
        hasOpenAIKey: !!OPENAI_API_KEY,
        hasSupabaseUrl: !!SUPABASE_URL,
        hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] Handling CORS preflight request`);
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    // Verify request has authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log(`[${requestId}] No authorization header provided`);
      return new Response(JSON.stringify({
        error: 'No authorization header provided'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create Supabase client with service role key for admin access
    console.log(`[${requestId}] Initializing Supabase client`);
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ?? '');
    // Get all pending documents that haven't been processed yet
    console.log(`[${requestId}] Fetching all pending documents`);
    const { data: documents, error: docError } = await supabaseAdmin.from('documents').select('*').eq('status', 'pending').is('openai_file_id', null);
    if (docError) {
      console.error(`[${requestId}] Error fetching documents:`, docError);
      throw new Error(`Error fetching documents: ${docError.message}`);
    }
    console.log(`[${requestId}] Found ${documents?.length} pending documents to process`);
    if (!documents || documents.length === 0) {
      console.log(`[${requestId}] No pending documents found`);
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        message: 'No pending documents found'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Process each document in sequence
    const results = [];
    for (const doc of documents){
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
    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      results,
      duration_ms: duration
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    console.error(`[${requestId}] Edge function error at ${endTime}`);
    console.error(`[${requestId}] Error details:`, error);
    console.error(`[${requestId}] Error stack:`, error.stack);
    console.error(`[${requestId}] Total execution time: ${duration}ms`);
    console.error('='.repeat(80));
    return new Response(JSON.stringify({
      error: error.message,
      duration_ms: duration
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
async function processDocument(supabaseAdmin, document) {
  let uploadedFileId = null;
  try {
    console.log(`[${document.id}] Starting document processing: ${document.filename}`);
    // Get file from storage bucket
    console.log(`[${document.id}] Downloading file from Supabase storage: ${document.file_path}`);
    const { data: fileData, error: fileError } = await supabaseAdmin.storage.from('contracts').download(document.file_path);
    if (fileError) {
      console.error(`[${document.id}] Error downloading file:`, fileError);
      throw new Error(`Error downloading file: ${fileError.message}`);
    }
    console.log(`[${document.id}] File downloaded successfully, size: ${fileData.length} bytes`);
    // Convert file to FormData for OpenAI Files API
    const formData = new FormData();
    formData.append('purpose', 'user_data');
    formData.append('file', new File([
      fileData
    ], document.filename, {
      type: 'application/pdf'
    }));
    // Submit file to OpenAI Files API
    console.log(`[${document.id}] Uploading file to OpenAI Files API`);
    const openAIResponse = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
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
    const { error: updateError } = await supabaseAdmin.from('documents').update({
      openai_file_id: uploadedFileId,
      status: 'processing',
      updated_at: new Date().toISOString()
    }).eq('id', document.id);
    if (updateError) {
      console.error(`[${document.id}] Error updating document:`, updateError);
      throw new Error(`Error updating document: ${updateError.message}`);
    }
    return {
      status: 'processed',
      documentId: document.id,
      openai_file_id: uploadedFileId
    };
  } catch (error) {
    console.error(`[${document.id}] Error processing document:`, error);
    // Update document status to error
    try {
      await supabaseAdmin.from('documents').update({
        status: 'error',
        updated_at: new Date().toISOString()
      }).eq('id', document.id);
    } catch (updateError) {
      console.error(`[${document.id}] Error updating document status to error:`, updateError);
    }
    return {
      status: 'error',
      documentId: document.id,
      error: error.message
    };
  }
}
async function analyzeDocument(supabaseAdmin, documentId, openai_file_id, party) {
  try {
    console.log(`[${documentId}] Starting document analysis with OpenAI`);
    // Call OpenAI API to analyze the document
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                file_id: openai_file_id
              },
              {
                type: "input_text",
                text: `You are a contract manager for ${party}. Extract the key obligations that ${party} has under the contract. If an obligation is time-based, the due date should be extracted too. Output ONLY a JSON array with each obligation containing 'obligation', 'section', and 'dueDate' fields.`
              }
            ]
          }
        ]
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
    }
    const responseData = await response.json();
    console.log(`[${documentId}] Received response from OpenAI`);
    // Process the results
    let obligations = [];

    console.log(`[${documentId}] Processing OpenAI response`);
    
    try {
      if (responseData && responseData.output && 
          Array.isArray(responseData.output) && 
          responseData.output.length > 0 && 
          responseData.output[0].content && 
          Array.isArray(responseData.output[0].content)) {
        
        // Find output_text content
        const outputTextItem = responseData.output[0].content.find(item => item.type === 'output_text');
        
        if (outputTextItem && outputTextItem.text) {
          console.log(`[${documentId}] Found output text, processing content`);
          let jsonText = outputTextItem.text;
          
          // Remove markdown code block if present
          if (jsonText.includes('```')) {
            jsonText = jsonText.replace(/```json\n|\```/g, '');
          }
          
          console.log(`[${documentId}] Cleaned JSON text: ${jsonText.substring(0, 100)}...`);
          
          try {
            // Parse the JSON directly
            obligations = JSON.parse(jsonText);
            console.log(`[${documentId}] Successfully parsed JSON obligations, count: ${obligations.length}`);
          } catch (parseError) {
            console.error(`[${documentId}] Error parsing JSON directly:`, parseError);
            
            // Fallback: Try to extract JSON using regex
            try {
              const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                obligations = JSON.parse(jsonMatch[0]);
                console.log(`[${documentId}] Successfully parsed JSON obligations using regex, count: ${obligations.length}`);
              } else {
                console.error(`[${documentId}] Could not find JSON array in text`);
                obligations = [{
                  obligation: "Could not extract JSON from response",
                  section: "N/A",
                  raw_response: jsonText
                }];
              }
            } catch (regexParseError) {
              console.error(`[${documentId}] Error parsing JSON with regex:`, regexParseError);
              obligations = [{
                obligation: "Error parsing AI response",
                section: "N/A",
                raw_response: jsonText
              }];
            }
          }
        } else {
          console.error(`[${documentId}] No output_text item found in content array`);
          obligations = [{
            obligation: "No output text in response",
            section: "N/A",
            raw_response: JSON.stringify(responseData)
          }];
        }
      } else {
        console.error(`[${documentId}] Unexpected response format:`, responseData);
        obligations = [{
          obligation: "Unexpected response format",
          section: "N/A",
          raw_response: JSON.stringify(responseData)
        }];
      }
    } catch (processingError) {
      console.error(`[${documentId}] Error processing OpenAI response:`, processingError);
      obligations = [{
        obligation: "Error processing OpenAI response",
        section: "N/A",
        raw_response: JSON.stringify(responseData)
      }];
    }
    // Update document with analysis results
    console.log(`[${documentId}] Updating document with analysis results`);
    const { error: updateError } = await supabaseAdmin.from('documents').update({
      status: 'analyzed',
      analysis_results: obligations,
      updated_at: new Date().toISOString()
    }).eq('id', documentId);
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
      await supabaseAdmin.from('documents').update({
        status: 'error',
        updated_at: new Date().toISOString()
      }).eq('id', documentId);
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
