import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { trade_id } = await req.json()

    if (!trade_id || typeof trade_id !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid trade_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('trade_id', trade_id)
      .maybeSingle()

    if (tradeError) {
      console.error('Trade fetch error:', tradeError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch trade', details: tradeError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!trade) {
      return new Response(
        JSON.stringify({ error: 'Trade not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (trade.mode !== 'paper') {
      return new Response(
        JSON.stringify({ error: 'Only paper trades can be closed via this action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (trade.status !== 'open') {
      return new Response(
        JSON.stringify({ error: 'Trade is already closed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch latest market tick for symbol
    const { data: md, error: mdError } = await supabase
      .from('enhanced_market_data')
      .select('price, timestamp')
      .eq('symbol', trade.symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (mdError) {
      console.error('Market data fetch error:', mdError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch market price', details: mdError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!md) {
      return new Response(
        JSON.stringify({ error: `No recent market tick for ${trade.symbol}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const exit_price = Number(md.price)
    if (!exit_price || isNaN(exit_price) || exit_price <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid market price' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: updated, error: updateError } = await supabase
      .from('trades')
      .update({
        status: 'closed',
        exit_date: new Date().toISOString(),
        exit_price,
        exit_price_source: 'enhanced_market_data',
      })
      .eq('trade_id', trade_id)
      .select()
      .maybeSingle()

    if (updateError) {
      console.error('Trade update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to close trade', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, trade: updated }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Unhandled error in close-paper-trade:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
