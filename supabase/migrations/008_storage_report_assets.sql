-- Constance Conservation — Image uploads for report maps (E5)
-- Spec: docs/executor_briefs/E5_image_uploads.md
-- 2026-04-23
--
-- Creates a public Storage bucket for report image assets:
--   § 1.0 Project Location maps  (per-client, stored in clients.location_maps)
--   § 4.0 Period polygon overlays (per-report, stored in client_reports.period_map_images)
--
-- Object layout: report_assets/{client_id}/{type}/{filename}
--   type ∈ {'location_map', 'period_map'}
--
-- Writes are service-role only (dashboard uses service-role key today). Reads
-- are public so generated reports and the preview iframe can render <img>
-- tags directly from storage URLs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('report_assets', 'report_assets', true)
ON CONFLICT (id) DO NOTHING;

-- Idempotent policy creation (storage.objects already has RLS enabled).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'public read report_assets'
    ) THEN
        CREATE POLICY "public read report_assets" ON storage.objects
            FOR SELECT USING (bucket_id = 'report_assets');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'service role write report_assets'
    ) THEN
        CREATE POLICY "service role write report_assets" ON storage.objects
            FOR INSERT TO service_role
            WITH CHECK (bucket_id = 'report_assets');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'service role update report_assets'
    ) THEN
        CREATE POLICY "service role update report_assets" ON storage.objects
            FOR UPDATE TO service_role
            USING (bucket_id = 'report_assets')
            WITH CHECK (bucket_id = 'report_assets');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'service role delete report_assets'
    ) THEN
        CREATE POLICY "service role delete report_assets" ON storage.objects
            FOR DELETE TO service_role
            USING (bucket_id = 'report_assets');
    END IF;
END $$;
