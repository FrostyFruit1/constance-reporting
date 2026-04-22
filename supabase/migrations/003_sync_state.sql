-- Constance Conservation — Sync State (WP3)
-- Tracks the high-water mark for scheduled sync polling.
-- One row per sync type (could extend to webhook state in future).
-- 2026-04-15

CREATE TABLE sync_state (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type       text NOT NULL UNIQUE,        -- 'scheduled_feed' or future types
    last_sync_at    timestamptz,                  -- last successful sync completion time
    last_modified_after timestamptz,              -- the modified_after value used in last run
    high_water_mark timestamptz,                  -- latest sc_modified_at seen across all inspections
    last_cursor     text,                         -- resume cursor if sync was interrupted
    total_synced    integer NOT NULL DEFAULT 0,   -- running total of inspections synced
    last_error      text,                         -- error from last run (null = clean)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed the initial row for scheduled feed sync
INSERT INTO sync_state (sync_type) VALUES ('scheduled_feed');

CREATE TRIGGER trg_sync_state_updated_at
    BEFORE UPDATE ON sync_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();
