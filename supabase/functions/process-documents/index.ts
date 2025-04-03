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
  console.log(`[${requestId}] Edge function started at ${new Date().toISOString()}`);
  
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

    // Parse request body
    const { userId } = await req.json();
    if (!userId) {
      console.log(`[${requestId}] No user ID provided in request body`);
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Processing request for user: ${userId}`);

    // Create Supabase client with service role key for admin access
    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY ?? ''
    );

    // Get pending documents for the user
    console.log(`[${requestId}] Fetching pending documents for user: ${userId}`);
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .filter('user_id', 'eq', userId)
      .filter('status', 'eq', 'pending')
      .filter('openai_file_id', 'is', null)
      .execute();

    if (docError) {
      console.error(`[${requestId}] Error fetching documents:`, docError);
      throw new Error(`Error fetching documents: ${docError.message}`);
    }

    console.log(`[${requestId}] Found ${documents.length} pending documents to process`);

    // Process each document in sequence
    const results = [];
    for (const doc of documents) {
      console.log(`[${requestId}] Starting processing for document: ${doc.id} (${doc.filename})`);
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

    console.log(`[${requestId}] Edge function completed successfully. Processed ${results.length} documents`);
    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] Edge function error:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
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

    console.log(`[${document.id}] Document processing completed successfully`);
    return {
      documentId: document.id,
      filename: document.filename,
      openai_file_id: uploadedFileId,
      status: 'processed'
    };
  } catch (error) {
    console.error(`[${document.id}] Error processing document:`, error);

    // Clean up the file if it was uploaded but processing failed
    if (uploadedFileId) {
      console.log(`[${document.id}] Cleaning up uploaded file: ${uploadedFileId}`);
      await cleanupFile(uploadedFileId);
    }

    // Update document status to error
    console.log(`[${document.id}] Updating document status to error`);
    await supabaseAdmin
      .from('documents')
      .update({
        status: 'error',
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', document.id);

    return {
      documentId: document.id,
      filename: document.filename,
      status: 'error',
      error: error.message
    };
  }
}

async function cleanupFile(fileId: string) {
  try {
    console.log(`[cleanup] Attempting to delete file: ${fileId}`);
    const response = await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[cleanup] Failed to delete file ${fileId}:`, errorText);
    } else {
      console.log(`[cleanup] Successfully deleted file ${fileId}`);
    }
  } catch (error) {
    console.error(`[cleanup] Error deleting file ${fileId}:`, error);
  }
}

async function analyzeDocument(supabaseAdmin: any, documentId: string, fileId: string, party: string) {
  try {
    console.log(`[${documentId}] Starting document analysis for party: ${party}`);
    
    // Create the analysis prompt using the party information
    console.log(`[${documentId}] Sending request to OpenAI API for document analysis`);
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file_id: fileId
              },
              {
                type: 'text',
                text: `You are a contract manager for ${party}. Extract the key obligations that ${party} has under the contract. If an obligation is time-based, the due date should be extracted too. This should be output strictly and entirely as json with each obligation, the section of the contract and it's due date (if any) identified.`
              }
            ]
          }
        ]
      })
    });

    console.log(`[${documentId}] OpenAI API response received with status: ${openAIResponse.status}`);
    const analysisData = await openAIResponse.json();
    
    if (!openAIResponse.ok) {
      console.error(`[${documentId}] OpenAI API error details:`, JSON.stringify(analysisData));
      throw new Error(`OpenAI Analysis API error: ${JSON.stringify(analysisData)}`);
    }
    
    const analysisContent = analysisData.choices[0].message.content;
    console.log(`[${documentId}] Analysis complete, processing response`);
    console.log(`[${documentId}] Raw analysis response preview:`, analysisContent.substring(0, 200) + '...');
    
    let obligationsJson;
    
    try {
      // Try to parse the response as JSON
      console.log(`[${documentId}] Attempting to parse OpenAI response as JSON`);
      obligationsJson = JSON.parse(analysisContent);
      console.log(`[${documentId}] Successfully parsed JSON. Found ${Array.isArray(obligationsJson) ? obligationsJson.length : 'unknown'} obligations`);
      
      // Validate the structure is as expected
      if (Array.isArray(obligationsJson)) {
        console.log(`[${documentId}] Obligation array example:`, JSON.stringify(obligationsJson[0] || {}));
      } else {
        console.log(`[${documentId}] WARNING: Obligations not in expected array format:`, typeof obligationsJson);
      }
    } catch (e) {
      console.error(`[${documentId}] Failed to parse OpenAI response as JSON:`, e);
      console.error(`[${documentId}] Response content preview:`, analysisContent.substring(0, 500) + (analysisContent.length > 500 ? '...' : ''));
      // If parsing fails, store the raw text
      obligationsJson = { raw_response: analysisContent };
    }
    
    // Update the document with the analysis results
    console.log(`[${documentId}] Updating document with analysis results in Supabase`);
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        analysis_results: obligationsJson,
        status: 'analyzed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);
    
    if (updateError) {
      console.error(`[${documentId}] Error updating document with analysis:`, updateError);
      throw new Error(`Error updating document with analysis: ${updateError.message}`);
    }
    
    // Clean up the file after successful analysis
    console.log(`[${documentId}] Cleaning up file after successful analysis`);
    await cleanupFile(fileId);
    
    console.log(`[${documentId}] Document analysis completed successfully`);
    return {
      documentId,
      status: 'analyzed',
      obligationsCount: Array.isArray(obligationsJson) ? obligationsJson.length : null
    };
  } catch (error) {
    console.error(`[${documentId}] Error analyzing document:`, error);
    
    // Update document status to analysis_error
    console.log(`[${documentId}] Updating document status to analysis_error`);
    await supabaseAdmin
      .from('documents')
      .update({
        status: 'analysis_error',
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);
    
    // Clean up the file even if analysis failed
    console.log(`[${documentId}] Cleaning up file after analysis error`);
    await cleanupFile(fileId);
    
    return {
      documentId,
      status: 'analysis_error',
      error: error.message
    };
  }
}

// Helper function to create a Supabase client
function createClient(supabaseUrl: string, supabaseKey: string) {
  return {
    from: (table: string) => ({
      select: (columns?: string) => ({
        eq: (column: string, value: any) => ({
          is: (column2: string, value2: any) => ({
            data: null,
            error: null,
            execute: async () => {
              const url = `${supabaseUrl}/rest/v1/${table}?select=${columns || '*'}&${column}=eq.${value}&${column2}=is.${value2}`;
              const response = await fetch(url, {
                headers: {
                  'Authorization': `Bearer ${supabaseKey}`,
                  'apikey': supabaseKey,
                }
              });
              const data = await response.json();
              return { data, error: null };
            }
          }),
          eq: (column2: string, value2: any) => {
            // This is a stub that will be overridden by the filter approach
            console.error("Multiple .eq() chaining is not supported. Please use filter() instead.");
            return {
              is: () => ({ execute: async () => ({ data: [], error: "Multiple .eq() chaining is not supported" }) }),
              execute: async () => ({ data: [], error: "Multiple .eq() chaining is not supported" })
            };
          },
          execute: async () => {
            const url = `${supabaseUrl}/rest/v1/${table}?select=${columns || '*'}&${column}=eq.${value}`;
            const response = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey,
              }
            });
            const data = await response.json();
            return { data, error: null };
          }
        }),
        filter: (column: string, operator: string, value: any) => {
          // Create a new filter builder that supports chaining
          const filters: Array<{column: string, operator: string, value: any}> = [
            { column, operator, value }
          ];
          
          const filterBuilder = {
            filter: (col: string, op: string, val: any) => {
              filters.push({ column: col, operator: op, value: val });
              return filterBuilder;
            },
            execute: async () => {
              // Build URL with all filters
              let url = `${supabaseUrl}/rest/v1/${table}?select=${columns || '*'}`;
              
              filters.forEach(f => {
                if (f.operator === 'eq') {
                  url += `&${f.column}=eq.${f.value}`;
                } else if (f.operator === 'is') {
                  url += `&${f.column}=is.${f.value === null ? 'null' : f.value}`;
                }
                // Add more operators as needed
              });
              
              const response = await fetch(url, {
                headers: {
                  'Authorization': `Bearer ${supabaseKey}`,
                  'apikey': supabaseKey,
                }
              });
              
              const data = await response.json();
              return { data, error: null };
            }
          };
          
          return filterBuilder;
        },
        execute: async () => {
          const url = `${supabaseUrl}/rest/v1/${table}?select=${columns || '*'}`;
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
            }
          });
          const data = await response.json();
          return { data, error: null };
        }
      }),
      update: (updates: any) => ({
        eq: (column: string, value: any) => ({
          execute: async () => {
            const url = `${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}`;
            const response = await fetch(url, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify(updates)
            });
            
            if (!response.ok) {
              const error = await response.json();
              return { error };
            }
            
            return { error: null };
          }
        })
      }),
      insert: (data: any) => ({
        execute: async () => {
          const url = `${supabaseUrl}/rest/v1/${table}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(data)
          });
          
          if (!response.ok) {
            const error = await response.json();
            return { error };
          }
          
          return { error: null };
        }
      })
    }),
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
            }
          });
          
          if (!response.ok) {
            return { error: { message: response.statusText } };
          }
          
          const data = await response.arrayBuffer();
          return { data: new Uint8Array(data), error: null };
        }
      })
    }
  };
}
