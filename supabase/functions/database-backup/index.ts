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
    const dbUrl = Deno.env.get('SUPABASE_DB_URL')!;

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the database URL to get connection parameters
    const url = new URL(dbUrl);
    const host = url.hostname;
    const port = url.port || '5432';
    const database = url.pathname.slice(1); // Remove leading slash
    const username = url.username;
    const password = url.password;

    console.log(`Connecting to database: ${host}:${port}/${database}`);

    // Create timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `database-backup-${timestamp}.sql`;

    // Run pg_dump command
    const pgDumpCommand = new Deno.Command('pg_dump', {
      args: [
        '--host', host,
        '--port', port,
        '--username', username,
        '--dbname', database,
        '--no-password',
        '--verbose',
        '--clean',
        '--if-exists',
        '--create',
        '--format', 'plain'
      ],
      env: {
        'PGPASSWORD': password,
      },
      stdout: 'piped',
      stderr: 'piped',
    });

    console.log('Executing pg_dump...');
    const pgDumpProcess = pgDumpCommand.spawn();
    const { code, stdout, stderr } = await pgDumpProcess.output();

    if (code !== 0) {
      const errorOutput = new TextDecoder().decode(stderr);
      console.error('pg_dump failed:', errorOutput);
      throw new Error(`pg_dump failed with code ${code}: ${errorOutput}`);
    }

    const dumpData = stdout;
    console.log(`Database dump completed. Size: ${dumpData.length} bytes`);

    // Upload to Supabase Storage
    console.log(`Uploading backup to storage as: ${filename}`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('moonshot-storage')
      .upload(filename, dumpData, {
        contentType: 'application/sql',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload backup: ${uploadError.message}`);
    }

    console.log('Backup uploaded successfully:', uploadData);

    // Get the public URL for the uploaded file (if bucket is public)
    const { data: urlData } = supabase.storage
      .from('moonshot-storage')
      .getPublicUrl(filename);

    const response = {
      success: true,
      message: 'Database backup completed successfully',
      filename: filename,
      uploadPath: uploadData.path,
      publicUrl: urlData.publicUrl,
      size: dumpData.length,
      timestamp: new Date().toISOString()
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