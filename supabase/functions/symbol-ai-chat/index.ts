import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MarketDataResult {
  symbol: string;
  price: number;
  price_change_1d?: number;
  price_change_5d?: number;
  data_date: string;
  volume?: number;
}

interface SentimentDataResult {
  symbol: string;
  data_date: string;
  avg_score: number;
  n_mentions: number;
  used_score: number;
}

interface TradeDataResult {
  symbol: string;
  side: string;
  horizon: string;
  status: string;
  entry_price: number;
  exit_price?: number;
  trade_date: string;
  mode: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { message, symbol, conversationHistory } = await req.json();

    // Available functions for the AI to call
    const functions = [
      {
        name: "get_market_data",
        description: "Get current and historical market data for a symbol including price, volume, and price changes",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock symbol" },
            days: { type: "number", description: "Number of days of historical data (default 30)" }
          },
          required: ["symbol"]
        }
      },
      {
        name: "get_sentiment_data",
        description: "Get Reddit sentiment data and mentions for a symbol",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock symbol" },
            days: { type: "number", description: "Number of days of historical data (default 30)" }
          },
          required: ["symbol"]
        }
      },
      {
        name: "get_trading_data",
        description: "Get trading history and signals for a symbol",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock symbol" },
            limit: { type: "number", description: "Number of recent trades (default 10)" }
          },
          required: ["symbol"]
        }
      },
      {
        name: "get_backtest_results",
        description: "Get backtest performance results for a symbol",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock symbol" }
          },
          required: ["symbol"]
        }
      },
      {
        name: "get_reddit_mentions",
        description: "Get actual Reddit post/comment text and sentiment scores for a symbol",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock symbol" },
            limit: { type: "number", description: "Number of recent mentions (default 20)" },
            days: { type: "number", description: "Number of days back to search (default 7)" }
          },
          required: ["symbol"]
        }
      },
      {
        name: "get_financial_news",
        description: "Get recent financial news articles for a symbol",
        parameters: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stock symbol" },
            days: { type: "number", description: "Number of days back to search (default 7)" }
          },
          required: ["symbol"]
        }
      }
    ];

    // Build conversation context
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        content: `You are a financial data assistant specializing in analyzing market data, Reddit sentiment, and trading signals. You help users understand:

- Market data (prices, volumes, technical indicators)
- Reddit sentiment analysis and mention trends
- Trading signals and backtest results
- Investment insights based on the available data

Be conversational, insightful, and provide specific data when available. When users ask about specific metrics or trends, call the appropriate functions to get real data.

Current symbol context: ${symbol || 'None specified'}`
      },
      ...conversationHistory.slice(-8), // Keep recent context
      { role: "user", content: message }
    ];

    // Initial API call to determine if function calling is needed
    const initialResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        functions,
        function_call: 'auto',
        temperature: 0.7,
        max_tokens: 1000
      }),
    });

    const initialData = await initialResponse.json();
    
    if (initialData.error) {
      console.error('OpenAI API error:', initialData.error);
      throw new Error(`OpenAI API error: ${initialData.error.message}`);
    }

    const choice = initialData.choices?.[0];
    if (!choice) {
      throw new Error('No response from OpenAI');
    }

    // Check if AI wants to call a function
    if (choice.message?.function_call) {
      const functionName = choice.message.function_call.name;
      const functionArgs = JSON.parse(choice.message.function_call.arguments || '{}');
      
      console.log(`Calling function: ${functionName}`, functionArgs);
      
      let functionResult: any = null;

      // Execute the appropriate function
      switch (functionName) {
        case 'get_market_data':
          const { data: marketData } = await supabase
            .from('enhanced_market_data')
            .select('symbol, price, price_change_1d, price_change_5d, data_date, volume')
            .eq('symbol', functionArgs.symbol.toUpperCase())
            .order('data_date', { ascending: false })
            .limit(functionArgs.days || 30);
          
          functionResult = marketData || [];
          break;

        case 'get_sentiment_data':
          const { data: sentimentData } = await supabase
            .from('v_reddit_daily_signals')
            .select('symbol, trade_date, avg_score, n_mentions, used_score')
            .eq('symbol', functionArgs.symbol.toUpperCase())
            .order('trade_date', { ascending: false })
            .limit(functionArgs.days || 30);
          
          functionResult = sentimentData || [];
          break;

        case 'get_trading_data':
          const { data: tradeData } = await supabase
            .from('trades')
            .select('symbol, side, horizon, status, entry_price, exit_price, trade_date, mode')
            .eq('symbol', functionArgs.symbol.toUpperCase())
            .order('entry_ts', { ascending: false })
            .limit(functionArgs.limit || 10);
          
          functionResult = tradeData || [];
          break;

        case 'get_backtest_results':
          const { data: backtestData } = await supabase
            .from('backtest_sweep_results')
            .select('symbol, horizon, side, trades, avg_ret, win_rate, sharpe, start_date, end_date')
            .eq('symbol', functionArgs.symbol.toUpperCase())
            .order('created_at', { ascending: false })
            .limit(10);
          
          functionResult = backtestData || [];
          break;

        case 'get_reddit_mentions':
          const daysBack = functionArgs.days || 7;
          const dateFilter = new Date();
          dateFilter.setDate(dateFilter.getDate() - daysBack);
          
          console.log(`Getting mentions for ${functionArgs.symbol} since ${dateFilter.toISOString()}`);
          
          // Get mentions with actual post/comment text and sentiment scores
          const { data: redditMentions, error: mentionsError } = await supabase
            .from('reddit_mentions')
            .select(`
              mention_id,
              symbol,
              doc_id,
              doc_type,
              created_utc,
              content_len,
              match_source,
              disambig_rule
            `)
            .eq('symbol', functionArgs.symbol.toUpperCase())
            .gte('created_utc', dateFilter.toISOString())
            .order('created_utc', { ascending: false })
            .limit(functionArgs.limit || 20);
          
          console.log(`Found ${redditMentions?.length || 0} mentions`);
          if (mentionsError) console.error('Mentions error:', mentionsError);
          
          // Get post/comment text for these mentions
          if (redditMentions && redditMentions.length > 0) {
            const postIds = redditMentions.filter(m => m.doc_type === 'post').map(m => m.doc_id);
            const commentIds = redditMentions.filter(m => m.doc_type === 'comment').map(m => m.doc_id);
            
            console.log(`Getting ${postIds.length} posts and ${commentIds.length} comments`);
            
            // Get posts
            const { data: posts } = await supabase
              .from('reddit_posts_std')
              .select('post_id, title, selftext, subreddit, score, created_utc')
              .in('post_id', postIds);
            
            // Get comments  
            const { data: comments } = await supabase
              .from('reddit_comments')
              .select('comment_id, body, subreddit, score, created_utc, post_id')
              .in('comment_id', commentIds);
            
            // Get sentiment scores
            const { data: sentiments } = await supabase
              .from('reddit_sentiment')
              .select('mention_id, overall_score, confidence, label, rationale')
              .in('mention_id', redditMentions.map(m => m.mention_id));
            
            // Combine all data
            const enrichedMentions = redditMentions.map(mention => {
              const sentiment = sentiments?.find(s => s.mention_id === mention.mention_id);
              let content = {};
              
              if (mention.doc_type === 'post') {
                const post = posts?.find(p => p.post_id === mention.doc_id);
                content = post || {};
              } else {
                const comment = comments?.find(c => c.comment_id === mention.doc_id);
                content = comment ? { ...comment, title: 'Comment', selftext: comment.body } : {};
              }
              
              return {
                mention_id: mention.mention_id,
                symbol: mention.symbol,
                doc_type: mention.doc_type,
                created_utc: mention.created_utc,
                match_source: mention.match_source,
                disambig_rule: mention.disambig_rule,
                content_len: mention.content_len,
                ...content,
                sentiment_score: sentiment?.overall_score || null,
                confidence: sentiment?.confidence || null,
                sentiment_label: sentiment?.label || null,
                rationale: sentiment?.rationale || null
              };
            });
            
            console.log(`Enriched ${enrichedMentions.length} mentions`);
            functionResult = enrichedMentions;
          } else {
            functionResult = [];
          }
          break;
          
        case 'get_financial_news':
          console.log(`Getting financial news for ${functionArgs.symbol}`);
          const newsResponse = await supabase.functions.invoke('financial-news', {
            body: { symbols: [functionArgs.symbol.toUpperCase()], days: functionArgs.days || 7 }
          });
          
          if (newsResponse.error) {
            console.error('Error fetching news:', newsResponse.error);
            functionResult = [];
          } else {
            functionResult = newsResponse.data?.articles || [];
          }
          break;
      }

      // Make second API call with function result
      const finalMessages = [
        ...messages,
        choice.message,
        {
          role: "function",
          name: functionName,
          content: JSON.stringify(functionResult)
        }
      ];

      const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: finalMessages,
          temperature: 0.7,
          max_tokens: 1000
        }),
      });

      const finalData = await finalResponse.json();
      
      if (finalData.error) {
        console.error('OpenAI API error (final):', finalData.error);
        throw new Error(`OpenAI API error: ${finalData.error.message}`);
      }

      return new Response(
        JSON.stringify({ 
          response: finalData.choices?.[0]?.message?.content || 'No response generated.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // No function call needed, return direct response
    return new Response(
      JSON.stringify({ 
        response: choice.message?.content || 'No response generated.'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in symbol-ai-chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        response: 'Sorry, I encountered an error processing your request. Please try again.'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});