-- Two model_trainings rows from 2025-01-04 point at training zips that did not
-- survive the move off the cloud Supabase (storage-api answers NoSuchKey). The
-- trained models live on Replicate; the zip was only the training input, so
-- the honest value is "no zip", not a link that 404s.
--
-- zip_url was NOT NULL, which forced either a dead link or an empty string.
-- Readers already treat a missing value as absent (generateNeuroPhotoDirect
-- checks !zip_url), so the constraint is dropped and the dead links nulled.
-- The original rows are kept in model_trainings_dead_zip_backup_20261002.
--
-- Applied to the Railway Postgres (Postgres-NFrq) on 2026-10-02.

BEGIN;

CREATE TABLE model_trainings_dead_zip_backup_20261002 AS
SELECT *
FROM model_trainings
WHERE zip_url LIKE '%/ai-training/training/144022504/training_images_173598%';

ALTER TABLE model_trainings ALTER COLUMN zip_url DROP NOT NULL;

UPDATE model_trainings
SET zip_url = NULL
WHERE id IN (SELECT id FROM model_trainings_dead_zip_backup_20261002);

COMMIT;
