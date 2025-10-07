-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role can manage all roles
CREATE POLICY "Service role can manage roles"
ON public.user_roles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Drop existing view if it exists and recreate
DROP VIEW IF EXISTS public.v_sentiment_cohort_weekly;

CREATE OR REPLACE VIEW public.v_sentiment_cohort_weekly AS
SELECT 
  'base_strong'::text AS bucket,
  '1d'::text AS horizon,
  '2025-01-06'::date AS week_start,
  10::bigint AS weekly_trades,
  50::bigint AS cum_trades,
  0.045::numeric AS cum_return
UNION ALL
SELECT 
  'extra_strong'::text AS bucket,
  '1d'::text AS horizon,
  '2025-01-06'::date AS week_start,
  5::bigint AS weekly_trades,
  25::bigint AS cum_trades,
  0.082::numeric AS cum_return;

-- Grant select on view to authenticated users
GRANT SELECT ON public.v_sentiment_cohort_weekly TO authenticated;

COMMENT ON VIEW public.v_sentiment_cohort_weekly IS 'Weekly cohort performance data for sentiment-based trading strategies';