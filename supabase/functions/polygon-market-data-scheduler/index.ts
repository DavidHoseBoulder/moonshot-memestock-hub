import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[${requestId}] ========== POLYGON SCHEDULER STARTED ==========`);
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch all active symbols from ticker_universe
    console.log(`[${requestId}] Fetching active symbols from ticker_universe...`);
    const { data: tickers, error: tickerError } = await supabase
      .from('ticker_universe')
      .select('symbol')
      .eq('active', true)
      .order('symbol');

    if (tickerError) {
      console.error(`[${requestId}] Error fetching tickers:`, tickerError);
      throw tickerError;
    }

    if (!tickers || tickers.length === 0) {
      console.log(`[${requestId}] No active tickers found`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active tickers to process',
          symbols_count: 0
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const symbols = tickers.map(t => t.symbol);
    console.log(`[${requestId}] Found ${symbols.length} active symbols: ${symbols.slice(0, 10).join(', ')}${symbols.length > 10 ? '...' : ''}`);

    // Call the polygon-market-data function with all symbols
    console.log(`[${requestId}] Calling polygon-market-data function...`);
    const { data: polygonData, error: polygonError } = await supabase.functions.invoke(
      'polygon-market-data',
      {
        body: { 
          symbols: symbols,
          days: 30 
        }
      }
    );

    if (polygonError) {
      console.error(`[${requestId}] Error from polygon-market-data:`, polygonError);
      throw polygonError;
    }

    console.log(`[${requestId}] Successfully processed ${polygonData?.total_processed || 0} symbols`);
    console.log(`[${requestId}] ========== POLYGON SCHEDULER COMPLETED ==========`);

    return new Response(
      JSON.stringify({
        success: true,
        symbols_requested: symbols.length,
        symbols_processed: polygonData?.total_processed || 0,
        stored_to_db: polygonData?.stored_to_db || 0,
        data: polygonData
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Unhandled error:`, error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error),
        requestId
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
