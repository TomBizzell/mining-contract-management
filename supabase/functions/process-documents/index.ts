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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify request has authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { userId } = await req.json();
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key for admin access
    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY ?? ''
    );

    // Get pending documents for the user
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .is('openai_file_id', null);

    if (docError) {
      throw new Error(`Error fetching documents: ${docError.message}`);
    }

    console.log(`Found ${documents.length} pending documents to process`);

    // Process each document in sequence
    const results = [];
    for (const doc of documents) {
      const result = await processDocument(supabaseAdmin, doc);
      
      // After uploading to OpenAI Files API, analyze the document
      if (result.status === 'processed' && result.openai_file_id) {
        await analyzeDocument(supabaseAdmin, result.documentId, result.openai_file_id, doc.party);
      }
      
      results.push(result);
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing documents:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processDocument(supabaseAdmin: any, document: any) {
  try {
    console.log(`Processing document: ${document.filename}`);

    // Get file from storage bucket
    const { data: fileData, error: fileError } = await supabaseAdmin.storage
      .from('contracts')
      .download(document.file_path);

    if (fileError) {
      throw new Error(`Error downloading file: ${fileError.message}`);
    }

    // Convert file to FormData for OpenAI API
    const formData = new FormData();
    formData.append('purpose', 'assistants');
    formData.append('file', new File([fileData], document.filename, { type: 'application/pdf' }));

    // Submit file to OpenAI API
    const openAIResponse = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    const openAIData = await openAIResponse.json();

    if (!openAIResponse.ok) {
      throw new Error(`OpenAI API error: ${JSON.stringify(openAIData)}`);
    }

    console.log(`OpenAI file uploaded: ${openAIData.id}`);

    // Update document record with OpenAI file ID
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        openai_file_id: openAIData.id,
        status: 'processing', // Change status to processing before analysis
        updated_at: new Date().toISOString(),
      })
      .eq('id', document.id);

    if (updateError) {
      throw new Error(`Error updating document: ${updateError.message}`);
    }

    return {
      documentId: document.id,
      filename: document.filename,
      openai_file_id: openAIData.id,
      status: 'processed'
    };
  } catch (error) {
    console.error(`Error processing document ${document.id}:`, error);

    // Update document status to error
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

async function analyzeDocument(supabaseAdmin: any, documentId: string, fileId: string, party: string) {
  try {
    console.log(`Analyzing document ${documentId} with file ID ${fileId} for party: ${party}`);
    
    // Create the analysis prompt using the party information
    console.log(`Sending request to OpenAI API for document analysis`);
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
                type: 'file_path',
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

    console.log(`OpenAI API response received with status: ${openAIResponse.status}`);
    const analysisData = await openAIResponse.json();
    
    if (!openAIResponse.ok) {
      console.error(`OpenAI API error details:`, JSON.stringify(analysisData));
      throw new Error(`OpenAI Analysis API error: ${JSON.stringify(analysisData)}`);
    }
    
    console.log(`Analysis complete for document ${documentId}, processing response`);
    console.log(`Raw analysis response:`, JSON.stringify(analysisData.choices?.[0]?.message?.content).substring(0, 200) + '...');
    
    // Extract the generated JSON from the response
    const analysisContent = analysisData.choices[0].message.content;
    let obligationsJson;
    
    try {
      // Try to parse the response as JSON
      console.log(`Attempting to parse OpenAI response as JSON`);
      obligationsJson = JSON.parse(analysisContent);
      console.log(`Successfully parsed JSON. Found ${Array.isArray(obligationsJson) ? obligationsJson.length : 'unknown'} obligations`);
      
      // Validate the structure is as expected
      if (Array.isArray(obligationsJson)) {
        console.log(`Obligation array example:`, JSON.stringify(obligationsJson[0] || {}));
      } else {
        console.log(`WARNING: Obligations not in expected array format:`, typeof obligationsJson);
      }
    } catch (e) {
      console.error("Failed to parse OpenAI response as JSON:", e);
      console.error("Response content:", analysisContent.substring(0, 500) + (analysisContent.length > 500 ? '...' : ''));
      // If parsing fails, store the raw text
      obligationsJson = { raw_response: analysisContent };
    }
    
    // Update the document with the analysis results
    console.log(`Updating document ${documentId} with analysis results in Supabase`);
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        analysis_results: obligationsJson,
        status: 'analyzed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);
    
    if (updateError) {
      console.error(`Error updating document with analysis:`, updateError);
      throw new Error(`Error updating document with analysis: ${updateError.message}`);
    }
    
    console.log(`Successfully updated document ${documentId} with analysis results`);
    return {
      documentId,
      status: 'analyzed',
      obligationsCount: Array.isArray(obligationsJson) ? obligationsJson.length : null
    };
  } catch (error) {
    console.error(`Error analyzing document ${documentId}:`, error);
    
    // Update document status to analysis_error
    await supabaseAdmin
      .from('documents')
      .update({
        status: 'analysis_error',
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);
    
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
