
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req) => {
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Export obligations function invoked`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get request parameters
    const { obligations, userId } = await req.json();
    
    if (!obligations || !Array.isArray(obligations) || !userId) {
      throw new Error('Invalid request parameters');
    }
    
    console.log(`[${requestId}] Exporting obligations for user ${userId}`);
    console.log(`[${requestId}] Number of obligations: ${obligations.length}`);
    
    // Initialize Supabase client with service role key
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get user's full name from profile
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();
      
    if (profileError) {
      console.error(`[${requestId}] Error fetching user profile:`, profileError);
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }
    
    // Prepare data for webhook
    const webhookData = {
      full_name: userProfile?.full_name || 'Anonymous User',
      content: obligations
    };
    
    console.log(`[${requestId}] Sending data to webhook for ${webhookData.full_name}`);
    
    // Send data to webhook
    const webhookResponse = await fetch('https://hook.eu1.make.com/mddk7wti95xpf24ub1cjhqt1qppgu716', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });
    
    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`[${requestId}] Webhook error:`, errorText);
      throw new Error(`Webhook responded with ${webhookResponse.status}: ${errorText}`);
    }
    
    const responseData = await webhookResponse.json();
    console.log(`[${requestId}] Webhook response:`, responseData);
    
    return new Response(JSON.stringify({
      success: true,
      documentUrl: responseData.documentUrl || responseData.url,
      message: 'Obligations exported successfully'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
