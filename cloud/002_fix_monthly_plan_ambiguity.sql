-- Apply in the Supabase SQL Editor if cloud/001_trade_management.sql was
-- already applied before this fix. The named primary-key constraint avoids
-- the PL/pgSQL output column `month_start` conflicting with the conflict key.
create or replace function public.ensure_monthly_plan(p_month_start date)
returns table (
  month_start date,
  starting_balance numeric,
  margin_per_contract numeric,
  contract_limit integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_month date := date_trunc('month', p_month_start::timestamp)::date;
  v_balance numeric(14,2);
  v_margin numeric(14,2);
  v_limit integer;
begin
  if v_user_id is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  if v_month > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Não é possível criar um lote para um mês futuro.' using errcode = '22023';
  end if;

  insert into public.trade_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select coalesce(sum(net_result), 0) into v_balance
  from public.trade_operations
  where user_id = v_user_id and operation_date < v_month;
  v_balance := v_balance + (
    select initial_capital from public.trade_profiles where user_id = v_user_id
  );

  v_margin := case
    when v_balance <= 20000 then 1000
    when v_balance <= 50000 then 2000
    when v_balance <= 100000 then 3000
    when v_balance <= 500000 then 5000
    else 10000
  end;
  v_limit := greatest(0, floor(v_balance / v_margin)::integer);

  insert into public.monthly_plans
    (user_id, month_start, starting_balance, margin_per_contract, contract_limit)
  values (v_user_id, v_month, v_balance, v_margin, v_limit)
  on conflict on constraint monthly_plans_pkey do nothing;

  return query select p.month_start, p.starting_balance,
                      p.margin_per_contract, p.contract_limit
  from public.monthly_plans p
  where p.user_id = v_user_id and p.month_start = v_month;
end;
$$;
