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
    console.log('[reddit-queue-processor] Starting queue processing cycle');
    
    // Process up to 5 jobs per cycle to avoid overwhelming the system
    const results = [];
    for (let i = 0; i < 5; i++) {
      console.log(`[reddit-queue-processor] Processing job ${i + 1}/5`);
      
      const { data, error } = await supabase.functions.invoke('reddit-worker');
      
      if (error) {
        console.error(`[reddit-queue-processor] Worker invocation ${i + 1} failed:`, error);
        results.push({ job: i + 1, error: error.message });
        break; // Stop on first error
      }
      
      if (data?.processed) {
        console.log(`[reddit-queue-processor] Job ${i + 1} processed successfully:`, data.run_id);
        results.push({ job: i + 1, processed: true, run_id: data.run_id });
        
        if (data.error) {
          console.log(`[reddit-queue-processor] Job ${i + 1} had processing error:`, data.error);
          break; // Stop if job failed during processing
        }
      } else {
        console.log(`[reddit-queue-processor] No more jobs to process after job ${i + 1}`);
        results.push({ job: i + 1, processed: false, message: 'No pending jobs' });
        break; // No more jobs
      }
    }
    
    console.log(`[reddit-queue-processor] Cycle complete. Processed ${results.length} job attempts`);
    
    return new Response(
      JSON.stringify({
        success: true,
        cycle_complete: true,
        jobs_processed: results.length,
        results
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error: any) {
    console.error('[reddit-queue-processor] Cycle error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});