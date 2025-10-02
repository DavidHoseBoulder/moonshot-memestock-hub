-- Remove the sentiment-score-daily cron job
SELECT cron.unschedule('sentiment-score-daily');