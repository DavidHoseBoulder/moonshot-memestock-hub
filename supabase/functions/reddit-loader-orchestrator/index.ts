import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[reddit-loader-orchestrator] Starting daily Reddit load process');
    
    // Generate unique run_id for this daily load
    const runId = `daily-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
    
    // Get the latest JSONL URL or use a default approach
    // For now, we'll trigger the queue processor to process any pending items
    const { data: queueItems, error: queueError } = await supabase
      .from('import_queue')
      .select('*')
      .eq('status', 'pending')
      .limit(1);

    if (queueError) {
      console.error('[reddit-loader-orchestrator] Error checking queue:', queueError);
    }

    // Invoke the queue processor to handle any pending imports
    const { data: processorResult, error: processorError } = await supabase.functions.invoke(
      'reddit-queue-processor',
      { body: { trigger: 'cron', run_id: runId } }
    );

    if (processorError) {
      console.error('[reddit-loader-orchestrator] Error invoking processor:', processorError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to invoke queue processor',
          details: processorError.message 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('[reddit-loader-orchestrator] Daily load completed successfully', {
      run_id: runId,
      pending_items: queueItems?.length || 0
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Daily Reddit load process initiated",
        run_id: runId,
        pending_queue_items: queueItems?.length || 0
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error: any) {
    console.error('[reddit-loader-orchestrator] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
