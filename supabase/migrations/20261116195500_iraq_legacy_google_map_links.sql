-- Allow legacy direct Google Maps CID and goo.gl/maps short links in addition to maps.app.goo.gl.
begin;
alter table public.dxn_directory_branches drop constraint if exists dxn_directory_branch_maps_url_valid;
alter table public.dxn_directory_branches add constraint dxn_directory_branch_maps_url_valid
check (
 char_length(maps_url)<=500
 and (maps_url='' or maps_url ~ '^https://(maps[.]app[.]goo[.]gl/|goo[.]gl/maps/|maps[.]google[.]com/[?]cid=[0-9]+|www[.]google[.]com/maps/|google[.]com/maps/)')
);
commit;