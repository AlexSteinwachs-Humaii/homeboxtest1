-- +goose Up
-- Do not infer disposal from archived or sold metadata on existing entities.
ALTER TABLE entities ADD COLUMN disposed boolean NOT NULL DEFAULT false;
ALTER TABLE entities ADD COLUMN disposal_history json NULL;

-- +goose Down
ALTER TABLE entities DROP COLUMN disposal_history;
ALTER TABLE entities DROP COLUMN disposed;
