-- Migration: add vehicle_type column to resident_vehicles and visitor_registrations
-- Run this in Supabase SQL Editor before deploying the vehicle type feature.

ALTER TABLE resident_vehicles
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT;

ALTER TABLE visitor_registrations
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT;

ALTER TABLE oversized_applications
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
