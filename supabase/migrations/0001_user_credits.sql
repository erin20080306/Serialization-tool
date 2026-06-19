-- 點數帳本：以 Email 綁定登入帳號，避免使用者清除 cookie 重置免費點數。
-- 在 Supabase SQL Editor 執行一次即可。

create table if not exists public.user_credits (
  email      text primary key,
  balance    integer not null default 200,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 僅由後端 service role 存取，啟用 RLS 且不開放任何匿名/anon 政策。
alter table public.user_credits enable row level security;

-- 原子扣點：插入（若不存在）→ 鎖列 → 檢查餘額 → 扣除。
-- 回傳新餘額；點數不足時回傳 -1（且不扣除）。
create or replace function public.deduct_credits(
  p_email text,
  p_cost  integer,
  p_free  integer default 200
)
returns integer
language plpgsql
security definer
as $$
declare
  cur    integer;
  newbal integer;
begin
  insert into public.user_credits(email, balance)
    values (p_email, p_free)
    on conflict (email) do nothing;

  select balance into cur
    from public.user_credits
   where email = p_email
   for update;

  if cur is null then
    cur := p_free;
  end if;

  if cur < p_cost then
    return -1; -- 點數不足
  end if;

  newbal := cur - p_cost;
  update public.user_credits
     set balance = newbal, updated_at = now()
   where email = p_email;

  return newbal;
end;
$$;

-- 選用：之後若要為使用者加值（購買點數包），可用此函式。
create or replace function public.add_credits(
  p_email   text,
  p_credits integer,
  p_free    integer default 200
)
returns integer
language plpgsql
security definer
as $$
declare
  newbal integer;
begin
  insert into public.user_credits(email, balance)
    values (p_email, p_free + p_credits)
    on conflict (email)
    do update set balance = public.user_credits.balance + p_credits,
                  updated_at = now()
  returning balance into newbal;
  return newbal;
end;
$$;
