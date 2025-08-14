-- Rollback: remove social_raw staging table and related objects
DROP TRIGGER IF EXISTS update_social_raw_updated_at ON public.social_raw;
DROP INDEX IF EXISTS social_raw_unique_source_reddit_id;
DROP INDEX IF EXISTS social_raw_subreddit_idx;
DROP INDEX IF EXISTS social_raw_posted_at_desc;
DROP TABLE IF EXISTS public.social_raw CASCADE;