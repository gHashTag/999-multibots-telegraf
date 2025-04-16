-- Create service_usage_stats table
CREATE TABLE IF NOT EXISTS public.service_usage_stats (
  id BIGSERIAL PRIMARY KEY,
  service_type TEXT NOT NULL,
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  average_response_time INTEGER DEFAULT 0,
  last_used TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT service_type_unique UNIQUE (service_type)
);

-- Create index on service_type
CREATE INDEX IF NOT EXISTS idx_service_usage_stats_service_type ON public.service_usage_stats(service_type);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_service_usage_stats_updated_at
  BEFORE UPDATE ON public.service_usage_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE public.service_usage_stats ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users"
  ON public.service_usage_stats
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow insert/update access to service role only
CREATE POLICY "Allow insert/update access to service role"
  ON public.service_usage_stats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.service_usage_stats TO authenticated;
GRANT ALL ON public.service_usage_stats TO service_role;
GRANT USAGE ON SEQUENCE public.service_usage_stats_id_seq TO service_role; 