-- Safe if 0002 already ran without logo_url.
ALTER TABLE featured_projects ADD COLUMN logo_url TEXT;
