-- Fix: book_visitor_registration must use Pacific Time midnight for month
-- boundaries, matching the TypeScript monthBounds() behaviour fixed in
-- commit 139cce1 (ptInputToISO-based UTC-ISO strings representing PDT midnight).
--
-- Root cause: the previous version used UTC midnight for month loop boundaries:
--   v_start_month := date_trunc('month', p_start_datetime)::date;       -- UTC-based
--   v_month_start_ts := v_iter_month::timestamp AT TIME ZONE 'UTC';
--   v_month_end_ts   := (v_iter_month + interval '1 month')::timestamp AT TIME ZONE 'UTC';
--
-- A booking that starts at May 31 18:00 PDT (= June 1 01:00 UTC) was treated
-- as a June booking by the UTC-based date_trunc, while TypeScript's fixed
-- monthBounds correctly placed it in May (end boundary = June 1 00:00 PDT =
-- June 1 07:00 UTC). This caused the display to show 10/10 while the RPC
-- allowed another booking (it saw only 9 existing nights for May).
--
-- Fix: use PDT calendar dates for the month loop, and PDT midnight for
-- v_month_start_ts / v_month_end_ts. Night counting already used PDT dates
-- via AT TIME ZONE 'America/Los_Angeles' and is unchanged.

CREATE OR REPLACE FUNCTION book_visitor_registration(
  p_unit_id                    uuid,
  p_visitor_name               text,
  p_visitor_phone              text,
  p_visitor_phone_country_code text,
  p_license_plate              text,
  p_plate_state                text,
  p_make                       text,
  p_model                      text,
  p_color                      text,
  p_start_datetime             timestamptz,
  p_end_datetime               timestamptz,
  p_access_code                text,
  p_quota_limit                integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_start_ts  timestamptz;
  v_month_end_ts    timestamptz;
  v_used_nights     integer;
  v_new_nights      integer;
  v_reg_id          uuid;
  v_iter_month      date;
  v_start_month     date;
  v_end_month       date;
BEGIN
  -- Serialize concurrent registrations for the same unit.
  -- Lock is released automatically at the end of this transaction.
  PERFORM pg_advisory_xact_lock(hashtext(p_unit_id::text)::bigint);

  -- Determine month range of the booking using Pacific Time calendar dates.
  -- date_trunc on the AT TIME ZONE-converted timestamp gives the PDT month.
  v_start_month := date_trunc('month', p_start_datetime AT TIME ZONE 'America/Los_Angeles')::date;
  v_end_month   := date_trunc('month', p_end_datetime   AT TIME ZONE 'America/Los_Angeles')::date;
  v_iter_month  := v_start_month;

  WHILE v_iter_month <= v_end_month LOOP
    -- Month boundaries as Pacific Time midnight, expressed as timestamptz.
    -- e.g. for May 2026: start = 2026-05-01 00:00 PDT = 2026-05-01T07:00Z
    --                     end   = 2026-06-01 00:00 PDT = 2026-06-01T07:00Z
    -- This matches what TypeScript monthBounds() now returns (ptInputToISO-based).
    v_month_start_ts := (v_iter_month::timestamp AT TIME ZONE 'America/Los_Angeles');
    v_month_end_ts   := ((v_iter_month + interval '1 month')::timestamp AT TIME ZONE 'America/Los_Angeles');

    -- Count nights already used this month by this unit.
    -- Night count uses Pacific Time calendar dates to match countNights() in TypeScript.
    SELECT COALESCE(SUM(
      ((LEAST(r.end_datetime, v_month_end_ts)       AT TIME ZONE 'America/Los_Angeles')::date -
       (GREATEST(r.start_datetime, v_month_start_ts) AT TIME ZONE 'America/Los_Angeles')::date
      )::integer
    ), 0)
    INTO v_used_nights
    FROM visitor_registrations r
    WHERE r.unit_id = p_unit_id
      AND r.start_datetime < v_month_end_ts
      AND r.end_datetime   > v_month_start_ts;

    -- Nights the new booking would consume within this month
    v_new_nights := GREATEST(0, (
      (LEAST(p_end_datetime, v_month_end_ts)         AT TIME ZONE 'America/Los_Angeles')::date -
      (GREATEST(p_start_datetime, v_month_start_ts)  AT TIME ZONE 'America/Los_Angeles')::date
    )::integer);

    IF v_new_nights > 0 AND (v_used_nights + v_new_nights) > p_quota_limit THEN
      RETURN jsonb_build_object('error', 'quota_exceeded');
    END IF;

    v_iter_month := v_iter_month + interval '1 month';
  END LOOP;

  -- Insert the registration (all checks passed)
  INSERT INTO visitor_registrations (
    unit_id, visitor_name, visitor_phone, visitor_phone_country_code,
    license_plate, plate_state, make, model, color,
    start_datetime, end_datetime, access_code
  ) VALUES (
    p_unit_id, p_visitor_name, p_visitor_phone, p_visitor_phone_country_code,
    p_license_plate, p_plate_state, p_make, p_model, p_color,
    p_start_datetime, p_end_datetime, p_access_code
  )
  RETURNING id INTO v_reg_id;

  RETURN jsonb_build_object('success', true, 'id', v_reg_id::text);
END;
$$;
