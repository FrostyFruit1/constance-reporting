-- Constance Conservation — Report Generator Round 2 Fixes (E1)
-- Spec: docs/executor_briefs/E1_round2_fixes.md
-- 2026-04-23

-- clients: long display name + site pattern for broader CAR/DWR matching
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS long_name       text,
    ADD COLUMN IF NOT EXISTS site_id_pattern text;

-- Seed EBSF client
UPDATE clients
SET long_name       = 'Elderslie Banksia Scrub Forest',
    site_id_pattern = 'EBSF|Elderslie',
    contact_name    = COALESCE(NULLIF(contact_name, 'Camden Council'), contact_name),
    council_or_body = COALESCE(council_or_body, 'Camden Council')
WHERE name ILIKE 'EBSF%';

-- Fix the specific contact_name that was seeded wrong
UPDATE clients
SET contact_name = 'Steven Robertson'
WHERE name ILIKE 'EBSF%' AND (contact_name IS NULL OR contact_name = 'Camden Council');

-- Seed organization phone/email/address (address already exists but per spec use new one)
UPDATE organizations
SET address = '6/9 Samantha Place, Smeaton Grange NSW 2567',
    phone   = '02 4666 2006',
    email   = 'info@constanceconservation.com.au'
WHERE name = 'Constance Conservation';
