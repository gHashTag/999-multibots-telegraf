-- Function to get service usage stats
CREATE OR REPLACE FUNCTION get_service_stats(p_service_type TEXT)
RETURNS TABLE (
  total_requests INTEGER,
  successful_requests INTEGER,
  failed_requests INTEGER,
  average_response_time INTEGER,
  last_used TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(s.total_requests, 0),
    COALESCE(s.successful_requests, 0),
    COALESCE(s.failed_requests, 0),
    COALESCE(s.average_response_time, 0),
    COALESCE(s.last_used, CURRENT_TIMESTAMP)
  FROM public.service_usage_stats s
  WHERE s.service_type = p_service_type;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 0, 0, CURRENT_TIMESTAMP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update service usage stats
CREATE OR REPLACE FUNCTION update_service_stats(
  p_service_type TEXT,
  p_success BOOLEAN,
  p_response_time INTEGER
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.service_usage_stats (
    service_type,
    total_requests,
    successful_requests,
    failed_requests,
    average_response_time,
    last_used
  )
  VALUES (
    p_service_type,
    1,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 0 ELSE 1 END,
    p_response_time,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (service_type)
  DO UPDATE SET
    total_requests = service_usage_stats.total_requests + 1,
    successful_requests = service_usage_stats.successful_requests + 
      CASE WHEN p_success THEN 1 ELSE 0 END,
    failed_requests = service_usage_stats.failed_requests + 
      CASE WHEN p_success THEN 0 ELSE 1 END,
    average_response_time = (
      service_usage_stats.average_response_time * service_usage_stats.total_requests + p_response_time
    ) / (service_usage_stats.total_requests + 1),
    last_used = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_service_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_service_stats(TEXT, BOOLEAN, INTEGER) TO service_role; 