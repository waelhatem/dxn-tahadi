-- Keep a service branch address without inventing a GPS position.
alter table public.dxn_directory_branches
  alter column latitude drop not null,
  alter column longitude drop not null;
alter table public.dxn_directory_branches
  add constraint dxn_directory_coordinates_pair_check
  check ((latitude is null and longitude is null) or
         (latitude is not null and longitude is not null));
