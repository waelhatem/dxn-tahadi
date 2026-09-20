-- Leader-controlled synchronization from a pasted Excel/CSV report into the DXN master registry.
-- The authenticated leader supplies normalized rows; member_no remains the stable primary key.

create or replace function public.leader_sync_dxn_team_members(
  p_token uuid,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  role_name text;
  row_data jsonb;
  member_no_clean text;
  existing_count integer;
  inserted_count integer := 0;
  updated_count integer := 0;
  invalid_count integer := 0;
  total_count integer := 0;
  invalid_rows jsonb := '[]'::jsonb;
  v_member_name text;
  v_sponsor_member_no text;
  v_sponsor_name text;
  v_generation integer;
  v_rank text;
  v_dxn_status text;
  v_downline_status text;
  v_join_date date;
  v_personal_pv numeric;
  v_personal_group_pv numeric;
  v_total_group_pv numeric;
  v_accumulated_group_pv numeric;
  v_accumulated_promotion_pv numeric;
  v_diamond_group_pv numeric;
  v_accumulated_group_pv_masked boolean;
  v_accumulated_promotion_pv_masked boolean;
  v_diamond_group_pv_masked boolean;
begin
  uid := public.current_user_id(p_token);

  if uid is null then
    raise exception using errcode='P0001', message='انتهت الجلسة';
  end if;

  select lower(trim(au.role))
    into role_name
  from public.app_users au
  where au.id = uid and au.active = true
  limit 1;

  if role_name <> 'leader' then
    raise exception using errcode='P0001', message='هذه العملية متاحة للقائد فقط';
  end if;

  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception using errcode='P0001', message='بيانات المزامنة يجب أن تكون قائمة';
  end if;

  for row_data in
    select value
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb))
  loop
    total_count := total_count + 1;

    begin
      member_no_clean := trim(coalesce(row_data->>'member_no',''));

      if member_no_clean = '' or member_no_clean !~ '^[0-9]{9}$' then
        invalid_count := invalid_count + 1;
        invalid_rows := invalid_rows || jsonb_build_array(
          jsonb_build_object(
            'row', total_count,
            'member_no', member_no_clean,
            'message', 'رقم العضوية يجب أن يكون 9 أرقام'
          )
        );
        continue;
      end if;

      v_member_name := nullif(trim(coalesce(row_data->>'member_name','')), '');
      v_sponsor_member_no := nullif(trim(coalesce(row_data->>'sponsor_member_no','')), '');
      v_sponsor_name := nullif(trim(coalesce(row_data->>'sponsor_name','')), '');
      v_rank := nullif(trim(coalesce(row_data->>'rank','')), '');
      v_dxn_status := nullif(trim(coalesce(row_data->>'dxn_status','')), '');
      v_downline_status := nullif(trim(coalesce(row_data->>'downline_status','')), '');

      v_generation := case
        when nullif(trim(coalesce(row_data->>'generation','')), '') is null then null
        else (row_data->>'generation')::integer
      end;

      v_join_date := case
        when nullif(trim(coalesce(row_data->>'join_date','')), '') is null then null
        else (row_data->>'join_date')::date
      end;

      v_personal_pv := case
        when nullif(trim(coalesce(row_data->>'personal_pv','')), '') is null then null
        else (row_data->>'personal_pv')::numeric
      end;

      v_personal_group_pv := case
        when nullif(trim(coalesce(row_data->>'personal_group_pv','')), '') is null then null
        else (row_data->>'personal_group_pv')::numeric
      end;

      v_total_group_pv := case
        when nullif(trim(coalesce(row_data->>'total_group_pv','')), '') is null then null
        else (row_data->>'total_group_pv')::numeric
      end;

      v_accumulated_group_pv := case
        when nullif(trim(coalesce(row_data->>'accumulated_group_pv','')), '') is null then null
        else (row_data->>'accumulated_group_pv')::numeric
      end;

      v_accumulated_promotion_pv := case
        when nullif(trim(coalesce(row_data->>'accumulated_promotion_pv','')), '') is null then null
        else (row_data->>'accumulated_promotion_pv')::numeric
      end;

      v_diamond_group_pv := case
        when nullif(trim(coalesce(row_data->>'diamond_group_pv','')), '') is null then null
        else (row_data->>'diamond_group_pv')::numeric
      end;

      v_accumulated_group_pv_masked := coalesce((row_data->>'accumulated_group_pv_masked')::boolean,false);
      v_accumulated_promotion_pv_masked := coalesce((row_data->>'accumulated_promotion_pv_masked')::boolean,false);
      v_diamond_group_pv_masked := coalesce((row_data->>'diamond_group_pv_masked')::boolean,false);

      select count(*)
        into existing_count
      from public.dxn_team_members
      where member_no = member_no_clean;

      if existing_count = 0 then
        insert into public.dxn_team_members (
          member_no, member_name, sponsor_member_no, sponsor_name,
          generation, rank, dxn_status, downline_status, join_date,
          personal_pv, personal_group_pv, total_group_pv,
          accumulated_group_pv, accumulated_promotion_pv, diamond_group_pv,
          accumulated_group_pv_masked, accumulated_promotion_pv_masked,
          diamond_group_pv_masked, source, source_updated_at, updated_at
        )
        values (
          member_no_clean, v_member_name, v_sponsor_member_no, v_sponsor_name,
          v_generation, v_rank, v_dxn_status, v_downline_status, v_join_date,
          v_personal_pv, v_personal_group_pv, v_total_group_pv,
          v_accumulated_group_pv, v_accumulated_promotion_pv, v_diamond_group_pv,
          v_accumulated_group_pv_masked, v_accumulated_promotion_pv_masked,
          v_diamond_group_pv_masked, 'excel_sync', now(), now()
        );

        inserted_count := inserted_count + 1;
      else
        update public.dxn_team_members
        set member_name = coalesce(v_member_name, member_name),
            sponsor_member_no = coalesce(v_sponsor_member_no, sponsor_member_no),
            sponsor_name = coalesce(v_sponsor_name, sponsor_name),
            generation = coalesce(v_generation, generation),
            rank = coalesce(v_rank, rank),
            dxn_status = coalesce(v_dxn_status, dxn_status),
            downline_status = coalesce(v_downline_status, downline_status),
            join_date = coalesce(v_join_date, join_date),
            personal_pv = coalesce(v_personal_pv, personal_pv),
            personal_group_pv = coalesce(v_personal_group_pv, personal_group_pv),
            total_group_pv = coalesce(v_total_group_pv, total_group_pv),
            accumulated_group_pv = coalesce(v_accumulated_group_pv, accumulated_group_pv),
            accumulated_promotion_pv = coalesce(v_accumulated_promotion_pv, accumulated_promotion_pv),
            diamond_group_pv = coalesce(v_diamond_group_pv, diamond_group_pv),
            accumulated_group_pv_masked = case
              when v_accumulated_group_pv_masked then true
              when v_accumulated_group_pv is not null then false
              else accumulated_group_pv_masked
            end,
            accumulated_promotion_pv_masked = case
              when v_accumulated_promotion_pv_masked then true
              when v_accumulated_promotion_pv is not null then false
              else accumulated_promotion_pv_masked
            end,
            diamond_group_pv_masked = case
              when v_diamond_group_pv_masked then true
              when v_diamond_group_pv is not null then false
              else diamond_group_pv_masked
            end,
            source = 'excel_sync',
            source_updated_at = now(),
            updated_at = now()
        where member_no = member_no_clean;

        updated_count := updated_count + 1;
      end if;

    exception when others then
      invalid_count := invalid_count + 1;
      invalid_rows := invalid_rows || jsonb_build_array(
        jsonb_build_object(
          'row', total_count,
          'member_no', member_no_clean,
          'message', coalesce(sqlerrm,'بيانات غير صالحة')
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'total_rows', total_count,
    'inserted', inserted_count,
    'updated', updated_count,
    'invalid', invalid_count,
    'invalid_rows', invalid_rows
  );
end;
$$;

revoke all on function public.leader_sync_dxn_team_members(uuid,jsonb)
  from public, anon, authenticated;

grant execute on function public.leader_sync_dxn_team_members(uuid,jsonb)
  to service_role;

notify pgrst, 'reload schema';
