-- Menu photos are public product artwork. Upload is through the approved-Admin
-- API, which validates/re-encodes bytes and assigns the storage path itself.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('jayds-menu-images','jayds-menu-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=5242880,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
