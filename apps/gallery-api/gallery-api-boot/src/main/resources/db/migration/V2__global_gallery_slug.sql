ALTER TABLE gallery DROP INDEX uk_gallery_tenant_slug;
ALTER TABLE gallery ADD UNIQUE KEY uk_gallery_slug (slug);
