-- visitor_monthly_quota was a write-only cache that was never read.
-- All quota calculations read directly from visitor_registrations.
DROP TABLE IF EXISTS visitor_monthly_quota;
