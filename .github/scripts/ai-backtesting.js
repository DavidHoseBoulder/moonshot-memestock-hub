
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate required environment variables
if (!SUPABASE_URL) {
  console.error('Error: SUPABASE_URL environment variable is required');
  process.exit(1);
}

if (!SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_ANON_KEY environment variable is required');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function analyzeWithAI(marketData, sentimentData, symbol) {
  const prompt = `
Analyze the following market and sentiment data for ${symbol} and generate an improved backtesting strategy.

Market Data Points: ${marketData.length}
Sentiment Data Points: ${sentimentData.length}

Recent Market Performance:
${marketData.slice(-10).map(d => `${d.timestamp}: $${d.price}`).join('\n')}

Recent Sentiment Scores:
${sentimentData.slice(-10).map(d => `${d.post_created_at}: ${d.overall_sentiment} (${d.sentiment_label})`).join('\n')}

Current strategy parameters:
- Sentiment threshold: 0.3
- Holding period: 3 days
- Position size: 10%

Please provide:
1. Recommended new strategy parameters based on the data
2. TypeScript code for an improved trading strategy function
3. Analysis of why these parameters would work better

Format your response as JSON with these keys:
{
  "analysis": "Your analysis explanation",
  "parameters": {
    "sentiment_threshold": 0.4,
    "holding_period_days": 5,
    "position_size": 0.15,
    "additional_filters": {}
  },
  "strategy_code": "TypeScript code for the new strategy function"
}
`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert quantitative analyst specializing in sentiment-based trading strategies. Provide actionable, data-driven recommendations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('OpenAI API response:', JSON.stringify(data, null, 2));

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected OpenAI API response format:', data);
      return null;
    }

    try {
      return JSON.parse(data.choices[0].message.content);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw response content:', data.choices[0].message.content);
      return null;
    }
  } catch (error) {
    console.error('AI Analysis failed:', error);
    return null;
  }
}

async function updateBacktestingStrategy(aiRecommendations, symbol) {
  if (!aiRecommendations) return;

  // Update the sentiment backtesting function with AI recommendations
  const backtestingPath = path.join(__dirname, '../../supabase/functions/sentiment-backtesting/index.ts');
  let backtestingCode = fs.readFileSync(backtestingPath, 'utf8');

  // Update default parameters in the backtesting function
  const newDefaults = `
    // AI-generated parameters based on analysis of ${symbol}
    // Analysis: ${aiRecommendations.analysis.slice(0, 200)}...
    sentiment_threshold: ${aiRecommendations.parameters.sentiment_threshold},
    holding_period_days: ${aiRecommendations.parameters.holding_period_days},
    position_size: ${aiRecommendations.parameters.position_size}`;

  // Insert AI-generated strategy code if provided
  if (aiRecommendations.strategy_code) {
    const strategyComment = `
    // AI-Generated Enhanced Strategy for ${symbol}
    // Generated on: ${new Date().toISOString()}
    ${aiRecommendations.strategy_code}`;
    
    backtestingCode = backtestingCode.replace(
      '// Run sentiment-based trading strategy',
      strategyComment + '\n    // Run sentiment-based trading strategy'
    );
  }

  fs.writeFileSync(backtestingPath, backtestingCode);

  // Create a strategy report
  const reportPath = path.join(__dirname, '../../ai-strategy-reports');
  if (!fs.existsSync(reportPath)) {
    fs.mkdirSync(reportPath, { recursive: true });
  }

  const reportFile = path.join(reportPath, `${symbol}-${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({
    symbol,
    timestamp: new Date().toISOString(),
    analysis: aiRecommendations.analysis,
    parameters: aiRecommendations.parameters,
    strategy_code: aiRecommendations.strategy_code
  }, null, 2));

  console.log(`Strategy updated for ${symbol} and saved to ${reportFile}`);
}

async function main() {
  const symbol = process.argv[2] || 'AAPL';
  const days = parseInt(process.argv[3]) || 30;

  console.log(`Running AI analysis for ${symbol} over ${days} days...`);

  try {
    // Fetch market data
    const { data: marketData, error: marketError } = await supabase
      .from('market_data')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp');

    if (marketError) {
      console.error('Error fetching market data:', marketError);
      return;
    }

    // Fetch sentiment data
    const { data: sentimentData, error: sentimentError } = await supabase
      .from('sentiment_analysis')
      .select('*')
      .contains('symbols_mentioned', [symbol.toUpperCase()])
      .gte('post_created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('post_created_at');

    if (sentimentError) {
      console.error('Error fetching sentiment data:', sentimentError);
    }

    console.log(`Found ${marketData?.length || 0} market data points and ${sentimentData?.length || 0} sentiment data points`);

    if (!marketData || marketData.length === 0) {
      console.log('No market data found, skipping AI analysis');
      return;
    }

    // Run AI analysis
    const aiRecommendations = await analyzeWithAI(marketData, sentimentData || [], symbol);
    
    if (aiRecommendations) {
      console.log('AI Analysis completed:', aiRecommendations.analysis);
      await updateBacktestingStrategy(aiRecommendations, symbol);
    } else {
      console.log('AI analysis failed or returned no recommendations');
    }

  } catch (error) {
    console.error('Error in AI backtesting:', error);
  }
}

main();
