-- Update cron jobs to run before market open (8:30 AM and 8:35 AM ET)
SELECT cron.alter_job(
  job_id := 2,
  schedule := '30 8 * * *'  -- 8:30 AM daily
);

SELECT cron.alter_job(
  job_id := 3, 
  schedule := '35 8 * * *'  -- 8:35 AM daily
);