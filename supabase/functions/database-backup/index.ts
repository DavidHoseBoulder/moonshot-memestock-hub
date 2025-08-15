import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting database backup process...');

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Creating SQL backup via Supabase client...');

    // Create timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `database-backup-${timestamp}.sql`;

    // Since pg_dump isn't available in edge functions, we'll export table data manually
    const tables = [
      'backtesting_results',
      'enhanced_market_data', 
      'enhanced_sentiment_data',
      'import_queue',
      'import_runs',
      'market_data',
      'sentiment_analysis',
      'sentiment_history',
      'ticker_universe',
      'trading_signals'
    ];

    let sqlContent = `-- Database backup generated on ${new Date().toISOString()}\n`;
    sqlContent += `-- Generated from Supabase project: ${supabaseUrl}\n\n`;

    // Export data from each table
    for (const table of tables) {
      try {
        console.log(`Backing up table: ${table}`);
        
        const { data, error } = await supabase
          .from(table)
          .select('*');

        if (error) {
          console.warn(`Error backing up table ${table}:`, error.message);
          sqlContent += `-- Error backing up table ${table}: ${error.message}\n\n`;
          continue;
        }

        if (!data || data.length === 0) {
          sqlContent += `-- Table ${table} is empty\n\n`;
          continue;
        }

        sqlContent += `-- Table: ${table}\n`;
        sqlContent += `-- Records: ${data.length}\n`;
        
        // Create JSON export for the table data
        sqlContent += `-- JSON Data for ${table}:\n`;
        sqlContent += `/*\n${JSON.stringify(data, null, 2)}\n*/\n\n`;

        // Create INSERT statements
        for (const row of data) {
          const columns = Object.keys(row);
          const values = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return val;
          });

          sqlContent += `INSERT INTO public.${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
        }
        
        sqlContent += `\n`;
        
      } catch (tableError) {
        console.error(`Error processing table ${table}:`, tableError);
        sqlContent += `-- Error processing table ${table}: ${tableError.message}\n\n`;
      }
    }

    const backupData = new TextEncoder().encode(sqlContent);
    console.log(`Backup SQL generated. Size: ${backupData.length} bytes`);

    // Upload to Supabase Storage
    console.log(`Uploading backup to storage as: ${filename}`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('moonshot-storage')
      .upload(filename, backupData, {
        contentType: 'application/sql',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload backup: ${uploadError.message}`);
    }

    console.log('Backup uploaded successfully:', uploadData);

    // Get the signed URL for download (valid for 1 hour)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('moonshot-storage')
      .createSignedUrl(filename, 3600);

    const response = {
      success: true,
      message: 'Database backup completed successfully',
      filename: filename,
      uploadPath: uploadData.path,
      downloadUrl: signedUrlData?.signedUrl,
      size: backupData.length,
      timestamp: new Date().toISOString(),
      tablesBackedUp: tables.length
    };

    console.log('Backup process completed:', response);

    return new Response(
      JSON.stringify(response),
      {
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        }
      }
    );

  } catch (error) {
    console.error('Database backup error:', error);
    
    const errorResponse = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});