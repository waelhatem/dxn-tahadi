-- Keep a service branch address without inventing a GPS position.
alter table public.dxn_directory_branches
  alter column latitude drop not null,
  alter column longitude drop not null;
do $migration$
begin
 if not exists (
   select 1 from pg_constraint
   where conname='dxn_directory_coordinates_pair_check'
     and conrelid='public.dxn_directory_branches'::regclass
 ) then
   alter table public.dxn_directory_branches
     add constraint dxn_directory_coordinates_pair_check
     check ((latitude is null and longitude is null) or
            (latitude is not null and longitude is not null));
 end if;
end $migration$;
