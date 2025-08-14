import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface QueueRequest {
  mode: string;
  jsonl_url?: string;
  subreddits?: string[];
  symbols?: string[];
  batch_size?: number;
  run_id?: string;
  max_items?: number;
  concurrency?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: QueueRequest = await req.json();
    
    if (body.mode === "jsonl_url" && body.jsonl_url && body.run_id) {
      // ONLY queue the work - no processing at all
      await supabase.from('import_runs').upsert({
        run_id: body.run_id,
        file: body.jsonl_url,
        batch_size: body.batch_size ?? 25,
        started_at: new Date().toISOString(),
        status: 'queued',
        scanned_total: 0,
        queued_total: 0,
        analyzed_total: 0,
        inserted_total: 0
      }, { onConflict: 'run_id' });

      // Store processing parameters for the worker to pick up
      await supabase.from('import_queue').insert({
        run_id: body.run_id,
        jsonl_url: body.jsonl_url,
        subreddits: body.subreddits || [],
        symbols: body.symbols || [],
        batch_size: body.batch_size ?? 25,
        max_items: body.max_items ?? 0,
        concurrency: body.concurrency ?? 3,
        status: 'pending',
        created_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({ 
          message: "Import queued successfully",
          run_id: body.run_id,
          status: "queued"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('[reddit-queue-import] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});