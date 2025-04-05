
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// Define response headers for CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Get environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://yowihgrlmntraktvruve.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const WEBHOOK_URL = 'https://hook.eu1.make.com/mddk7wti95xpf24ub1cjhqt1qppgu716';

// Serve HTTP requests
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    // Get request data
    const requestData = await req.json();
    const { obligations, userId } = requestData;
    
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing userId' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Initialize Supabase client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Fetch user profile to get full name
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();
    
    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Error fetching user profile: ${profileError.message}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    // Send data to webhook
    console.log(`Sending ${obligations.length} obligations to webhook for user ${userId}`);
    
    const webhookPayload = {
      full_name: profileData?.full_name || 'User',
      content: obligations
    };
    
    console.log('Webhook payload:', JSON.stringify(webhookPayload));
    
    const webhookResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });
    
    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      throw new Error(`Webhook error (${webhookResponse.status}): ${errorText}`);
    }
    
    // Parse webhook response
    const responseData = await webhookResponse.json();
    console.log('Webhook response:', responseData);
    
    // Return successful response with document URL
    return new Response(
      JSON.stringify({
        success: true,
        documentUrl: responseData.documentUrl || responseData.url || null,
        message: 'Obligations exported successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unknown error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
