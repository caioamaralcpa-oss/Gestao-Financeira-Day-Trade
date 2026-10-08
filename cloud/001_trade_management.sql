-- WDO trade journal. Apply once in the Supabase SQL Editor.
create table if not exists public.trade_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  initial_capital numeric(14,2) not null default 0 check (initial_capital >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null check (extract(day from month_start) = 1),
  starting_balance numeric(14,2) not null check (starting_balance >= 0),
  margin_per_contract numeric(14,2) not null check (margin_per_contract > 0),
  contract_limit integer not null check (contract_limit >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, month_start)
);

create table if not exists public.trade_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_date date not null,
  month_start date generated always as
    (date_trunc('month', operation_date::timestamp)::date) stored,
  outcome text not null check (outcome in ('gain', 'stop', 'flat')),
  contracts integer not null check (contracts > 0),
  costs numeric(12,2) not null default 0 check (costs >= 0),
  gross_result numeric(14,2) generated always as (
    case outcome when 'gain' then 60.00 * contracts
                 when 'stop' then -100.00 * contracts
                 else 0.00 end
  ) stored,
  net_result numeric(14,2) generated always as (
    case outcome when 'gain' then 60.00 * contracts - costs
                 when 'stop' then -100.00 * contracts - costs
                 else 0.00 - costs end
  ) stored,
  created_at timestamptz not null default now(),
  unique (user_id, operation_date),
  foreign key (user_id, month_start)
    references public.monthly_plans(user_id, month_start)
);

create index if not exists trade_operations_user_date_idx
  on public.trade_operations (user_id, operation_date desc);

create or replace function public.enforce_monthly_contract_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare allowed_contracts integer;
begin
  select contract_limit into allowed_contracts
  from public.monthly_plans
  where user_id = new.user_id and month_start = new.month_start;

  if not found then
    raise exception 'O lote mensal ainda não foi calculado.' using errcode = '23503';
  end if;
  if new.contracts > allowed_contracts then
    raise exception 'A quantidade excede o lote mensal de % contrato(s).', allowed_contracts
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trade_operations_check_monthly_limit on public.trade_operations;
create trigger trade_operations_check_monthly_limit
before insert on public.trade_operations
for each row execute function public.enforce_monthly_contract_limit();

-- The first authenticated use of a month fixes its lot using the balance at
-- the beginning of that month. Repeated calls return the same immutable plan.
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
  on conflict (user_id, month_start) do nothing;

  return query select p.month_start, p.starting_balance,
                      p.margin_per_contract, p.contract_limit
  from public.monthly_plans p
  where p.user_id = v_user_id and p.month_start = v_month;
end;
$$;

alter table public.trade_profiles enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.trade_operations enable row level security;

drop policy if exists trade_profiles_select_own on public.trade_profiles;
create policy trade_profiles_select_own on public.trade_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists trade_profiles_insert_own on public.trade_profiles;
create policy trade_profiles_insert_own on public.trade_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists trade_profiles_update_own on public.trade_profiles;
create policy trade_profiles_update_own on public.trade_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists monthly_plans_select_own on public.monthly_plans;
create policy monthly_plans_select_own on public.monthly_plans
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists monthly_plans_insert_own on public.monthly_plans;
create policy monthly_plans_insert_own on public.monthly_plans
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists trade_operations_select_own on public.trade_operations;
create policy trade_operations_select_own on public.trade_operations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists trade_operations_insert_own on public.trade_operations;
create policy trade_operations_insert_own on public.trade_operations
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists trade_operations_delete_own on public.trade_operations;
create policy trade_operations_delete_own on public.trade_operations
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.trade_profiles, public.monthly_plans, public.trade_operations from anon, public;
grant select on public.trade_profiles, public.monthly_plans, public.trade_operations to authenticated;
grant insert (user_id, initial_capital, updated_at) on public.trade_profiles to authenticated;
grant update (initial_capital, updated_at) on public.trade_profiles to authenticated;
grant insert (user_id, operation_date, outcome, contracts, costs)
  on public.trade_operations to authenticated;
grant delete on public.trade_operations to authenticated;
revoke all on function public.ensure_monthly_plan(date) from public, anon;
grant execute on function public.ensure_monthly_plan(date) to authenticated;

-- Supabase projects must expose public tables through the Data API.
grant usage on schema public to authenticated;
