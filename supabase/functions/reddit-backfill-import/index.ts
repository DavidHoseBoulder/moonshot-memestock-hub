import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

interface BackfillRequest {
  mode?: "posts" | "jsonl_url";
  posts?: any[];
  jsonl_url?: string;
  subreddits?: string[];
  symbols?: string[];
  batch_size?: number;
  run_id?: string;
  max_items?: number;
  concurrency?: number;
  _continue_from_line?: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log('[reddit-backfill-import] *** FUNCTION START ***');
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log('[reddit-backfill-import] OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[reddit-backfill-import] Parsing request body...');
    const body: BackfillRequest = await req.json();
    console.log('[reddit-backfill-import] Request parsed:', {
      mode: body.mode,
      jsonl_url: body.jsonl_url ? 'provided' : 'missing',
      run_id: body.run_id,
      _continue_from_line: body._continue_from_line
    });

    return new Response(
      JSON.stringify({
        message: "Function is working!",
        received: body
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error: any) {
    console.error('[reddit-backfill-import] ERROR:', error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});