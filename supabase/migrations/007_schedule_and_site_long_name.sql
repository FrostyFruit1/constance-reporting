-- Constance Conservation — Clients/Zones UI support (E4)
-- Spec: docs/executor_briefs/E4_clients_zones_ui.md
-- 2026-04-23
--
-- Adds per-row schedule configuration (no cron yet — stored only, read by a
-- future scheduler) and a display long_name on sites so the Site detail page
-- can separate the internal/SC label from the human-friendly name.
--
-- schedule_config shape: { cadence: 'off'|'weekly'|'monthly'|'quarterly',
--                           weekday?: 1..7, day_of_month?: 1..31 }

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS schedule_config jsonb,
    ADD COLUMN IF NOT EXISTS contact_phone   text;

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS schedule_config jsonb,
    ADD COLUMN IF NOT EXISTS long_name       text;
