-- Rename the Academy label to "Community Academy" in existing challenge records.
-- Challenge IDs and submissions remain unchanged.

begin;

update public.challenges
set
  title = replace(title, 'أكاديمية المنصة', 'أكاديمية المجتمع'),
  description = replace(description, 'أكاديمية المنصة', 'أكاديمية المجتمع')
where title like '%أكاديمية المنصة%'
   or description like '%أكاديمية المنصة%';

commit;
