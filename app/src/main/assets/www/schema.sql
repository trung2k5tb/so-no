-- =========================================================
-- SỔ NỢ - SUPABASE SCHEMA
-- BẢN MỚI:
-- 1) Admin cố định: trungok885@gmail.com
-- 2) Loại bỏ hoàn toàn ngân hàng + VietQR
-- 3) Lịch sử khoản vay
-- 4) App CTTC / App đen
-- 5) RLS + Realtime
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- 0. LOẠI BỎ HOÀN TOÀN BANK / VIETQR
-- =========================================================

drop table if exists public.bank_accounts cascade;

-- Nếu database cũ có các bảng VietQR riêng, xóa chúng nếu tồn tại.
drop table if exists public.vietqr_accounts cascade;
drop table if exists public.vietqr_payments cascade;

-- =========================================================
-- 1. PROFILES
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  dob date,
  gender text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Đặt tài khoản admin cố định.
update public.profiles
set is_admin = true,
    updated_at = now()
where lower(email) = lower('trungok885@gmail.com');

-- =========================================================
-- 2. DEBTS
-- =========================================================

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  type text not null
    check (type in ('lend','borrow')),

  group_type text not null
    check (group_type in ('personal','bank','finance')),

  person_name text,
  phone text,
  institution text,
  contract_code text,

  amount numeric(18,2) not null default 0,
  remaining numeric(18,2) not null default 0,

  start_date date,
  due_date date,

  interest_rate numeric(8,3) default 0,
  term text,

  reminder_days int default 7,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 3. DEBT PAYMENTS
-- =========================================================

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  note text
);

-- =========================================================
-- 4. DEBT TRANSACTIONS / LỊCH SỬ
-- =========================================================

create table if not exists public.debt_transactions (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  amount numeric(18,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

-- Có thể chạy schema nhiều lần mà không lỗi constraint.
alter table public.debt_transactions
drop constraint if exists debt_transactions_type_check;

alter table public.debt_transactions
add constraint debt_transactions_type_check
check (type in ('initial','payment','lend_more'));

-- Backfill lịch sử cho khoản nợ cũ.
insert into public.debt_transactions
(
  debt_id,
  owner_id,
  type,
  amount,
  note,
  created_at
)
select
  d.id,
  d.owner_id,
  'initial',
  d.amount,
  'Khoản vay ban đầu',
  coalesce(d.created_at, now())
from public.debts d
where not exists (
  select 1
  from public.debt_transactions t
  where t.debt_id = d.id
);

-- =========================================================
-- 5. FRIENDS
-- =========================================================

create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.friends
  add column if not exists friend_user_id uuid;

create unique index if not exists friends_owner_friend_unique
on public.friends(owner_id, friend_user_id)
where friend_user_id is not null;

-- =========================================================
-- 6. FRIEND REQUESTS
-- =========================================================

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  sender_name text,
  sender_email text,
  receiver_name text,
  receiver_email text,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_pending_unique
on public.friend_requests(sender_id, receiver_id)
where status = 'pending';

-- =========================================================
-- 7. NOTIFICATIONS
-- =========================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'system',
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 8. LOCATION SHARES
-- =========================================================

create table if not exists public.location_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_user uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 9. LOCATIONS
-- =========================================================

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  recorded_at timestamptz not null default now()
);

-- =========================================================
-- 10. REMINDER SETTINGS
-- =========================================================

create table if not exists public.reminder_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  days_before int[] not null default array[7,3,1,0],
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 11. LOCATION SHARE SESSIONS
-- =========================================================

create table if not exists public.location_share_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete cascade,
  label text,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 12. PUSH SUBSCRIPTIONS
-- =========================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

-- Native Android FCM fields
alter table public.push_subscriptions add column if not exists fcm_token text;
alter table public.push_subscriptions add column if not exists platform text;
alter table public.push_subscriptions add column if not exists provider text;
create unique index if not exists push_subscriptions_fcm_token_uidx
  on public.push_subscriptions(fcm_token) where fcm_token is not null;

-- =========================================================
-- 13. REMINDER EVENTS
-- =========================================================

create table if not exists public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  reminder_day int not null,
  target_date date not null,
  sent_at timestamptz,
  unique(user_id, debt_id, reminder_day, target_date)
);

-- =========================================================
-- 14. APP CTTC / APP ĐEN
-- =========================================================

create table if not exists public.app_links (
  id uuid primary key default gen_random_uuid(),

  category text not null
    check (category in ('cttc','black')),

  name text not null,
  url text not null,
  note text,

  sort_order integer not null default 0,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_links_category_sort_idx
on public.app_links(category, sort_order, created_at);

-- =========================================================
-- 14B. COMPATIBILITY / LEGACY COLUMN NORMALIZATION
-- =========================================================
-- Các phiên bản schema cũ dùng user_id trong một số bảng,
-- trong khi bản hiện tại dùng owner_id. Bổ sung cả hai tên
-- để schema có thể chạy an toàn trên database đã tồn tại.

alter table if exists public.profiles
  add column if not exists email text;

alter table if exists public.friends
  add column if not exists user_id uuid;

alter table if exists public.friends
  add column if not exists owner_id uuid;

alter table if exists public.friends
  add column if not exists friend_user_id uuid;

update public.friends
set owner_id = coalesce(owner_id, user_id)
where owner_id is null;

alter table if exists public.debt_transactions
  add column if not exists user_id uuid;

alter table if exists public.debt_transactions
  add column if not exists owner_id uuid;

update public.debt_transactions
set owner_id = coalesce(owner_id, user_id)
where owner_id is null;

alter table if exists public.locations
  add column if not exists user_id uuid;

alter table if exists public.locations
  add column if not exists owner_id uuid;

update public.locations
set owner_id = coalesce(owner_id, user_id)
where owner_id is null;

alter table if exists public.notifications
  add column if not exists user_id uuid;

alter table if exists public.push_subscriptions
  add column if not exists user_id uuid;

alter table if exists public.reminder_events
  add column if not exists user_id uuid;

alter table if exists public.reminder_settings
  add column if not exists owner_id uuid;

alter table if exists public.location_share_sessions
  add column if not exists owner_id uuid;

alter table if exists public.location_shares
  add column if not exists owner_id uuid;

-- Tin nhắn cũ dùng deleted_at cho thu hồi; giữ nguyên để tương thích.
alter table if exists public.messages
  add column if not exists deleted_at timestamptz;

-- =========================================================
-- 14C. CHAT / FUNCTION COMPATIBILITY
-- =========================================================
-- Xóa function cũ trước khi đổi return type / tên input parameter.

drop function if exists public.get_friend_suggestions();
drop function if exists public.send_friend_request_by_user_id(uuid);
drop function if exists public.recall_message(uuid);
drop function if exists public.hide_conversation(uuid);
drop function if exists public.get_or_create_conversation(uuid);

-- =========================================================
-- 15. RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
alter table public.debt_transactions enable row level security;
alter table public.friends enable row level security;
alter table public.friend_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.location_shares enable row level security;
alter table public.locations enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.location_share_sessions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_events enable row level security;
alter table public.app_links enable row level security;

-- =========================================================
-- 16. XÓA POLICY CŨ
-- =========================================================

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'debts',
        'debt_payments',
        'debt_transactions',
        'friends',
        'friend_requests',
        'notifications',
        'location_shares',
        'locations',
        'reminder_settings',
        'location_share_sessions',
        'push_subscriptions',
        'reminder_events',
        'app_links'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  end loop;
end $$;

-- =========================================================
-- 17. PROFILE POLICY
-- =========================================================

create policy "profiles own"
on public.profiles
for all
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- =========================================================
-- 18. DEBT POLICY
-- =========================================================

create policy "debts own"
on public.debts
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- =========================================================
-- 19. PAYMENT POLICY
-- =========================================================

create policy "payments own"
on public.debt_payments
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- =========================================================
-- 20. TRANSACTION POLICY
-- =========================================================

create policy "transactions own"
on public.debt_transactions
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- =========================================================
-- 21. FRIEND POLICY
-- =========================================================

create policy "friends own"
on public.friends
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- =========================================================
-- 22. FRIEND REQUEST POLICY
-- =========================================================

create policy "friend requests participants"
on public.friend_requests
for select
to authenticated
using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
);

create policy "friend requests receiver update"
on public.friend_requests
for update
to authenticated
using (receiver_id = auth.uid())
with check (receiver_id = auth.uid());

-- =========================================================
-- 23. NOTIFICATION POLICY
-- =========================================================

create policy "notifications own"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

create policy "notifications own update"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================================================
-- 24. LOCATION SHARE POLICY
-- =========================================================

create policy "shares participants"
on public.location_shares
for all
to authenticated
using (
  owner_id = auth.uid()
  or shared_with_user = auth.uid()
)
with check (
  owner_id = auth.uid()
  or shared_with_user = auth.uid()
);

-- =========================================================
-- 25. LOCATION POLICY
-- =========================================================

create policy "locations own or shared"
on public.locations
for select
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.location_share_sessions s
    where s.owner_id = locations.owner_id
      and s.viewer_id = auth.uid()
      and s.active = true
      and (
        s.expires_at is null
        or s.expires_at > now()
      )
  )
);

create policy "locations insert own"
on public.locations
for insert
to authenticated
with check (owner_id = auth.uid());

-- =========================================================
-- 26. REMINDER SETTINGS
-- =========================================================

create policy "reminders own"
on public.reminder_settings
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- =========================================================
-- 27. LOCATION SESSION
-- =========================================================

create policy "share sessions participants"
on public.location_share_sessions
for all
to authenticated
using (
  owner_id = auth.uid()
  or viewer_id = auth.uid()
)
with check (
  owner_id = auth.uid()
  or viewer_id = auth.uid()
);

-- =========================================================
-- 28. PUSH
-- =========================================================

create policy "push own"
on public.push_subscriptions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================================================
-- 29. REMINDER EVENTS
-- =========================================================

create policy "reminder events own"
on public.reminder_events
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================================================
-- 30. APP LINKS - USER READ / ADMIN FULL ACCESS
-- =========================================================

create policy "app links read"
on public.app_links
for select
to authenticated
using (
  active = true
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

create policy "app links admin insert"
on public.app_links
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

create policy "app links admin update"
on public.app_links
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

create policy "app links admin delete"
on public.app_links
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

-- =========================================================
-- 31. SIGNUP TRIGGER
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.profiles(
    id,
    full_name,
    email,
    phone,
    is_admin
  )
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    new.phone,
    lower(coalesce(new.email, '')) = lower('trungok885@gmail.com')
  )
  on conflict(id)
  do update set
    email = excluded.email,
    phone = excluded.phone,
    is_admin = case
      when lower(coalesce(excluded.email, '')) =
           lower('trungok885@gmail.com')
      then true
      else public.profiles.is_admin
    end,
    updated_at = now();

  return new;

end;
$$;

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

-- Đảm bảo tài khoản Admin hiện tại được cấp quyền.
update public.profiles
set is_admin = true,
    updated_at = now()
where lower(email) = lower('trungok885@gmail.com');

-- =========================================================
-- 32. SEND FRIEND REQUEST
-- =========================================================

create or replace function public.send_friend_request_by_email(
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target public.profiles;
  existing_friend boolean;
  rid uuid;
begin

  select *
  into target
  from public.profiles
  where lower(email) = lower(trim(p_email))
  limit 1;

  if target.id is null then
    raise exception 'Không tìm thấy tài khoản với email này';
  end if;

  if target.id = auth.uid() then
    raise exception 'Bạn không thể kết bạn với chính mình';
  end if;

  select exists(
    select 1
    from public.friends
    where owner_id = auth.uid()
      and friend_user_id = target.id
  )
  into existing_friend;

  if existing_friend then
    raise exception 'Hai người đã là bạn bè';
  end if;

  if exists(
    select 1
    from public.friend_requests
    where sender_id = auth.uid()
      and receiver_id = target.id
      and status = 'pending'
  ) then
    raise exception 'Lời mời đã được gửi';
  end if;

  if exists(
    select 1
    from public.friend_requests
    where sender_id = target.id
      and receiver_id = auth.uid()
      and status = 'pending'
  ) then
    raise exception 'Người này đã gửi lời mời cho bạn';
  end if;

  insert into public.friend_requests(
    sender_id,
    receiver_id,
    sender_name,
    sender_email,
    receiver_name,
    receiver_email
  )
  values(
    auth.uid(),
    target.id,
    (
      select full_name
      from public.profiles
      where id = auth.uid()
    ),
    (
      select email
      from public.profiles
      where id = auth.uid()
    ),
    target.full_name,
    target.email
  )
  returning id into rid;

  insert into public.notifications(
    user_id,
    title,
    body,
    type,
    data
  )
  values(
    target.id,
    'Lời mời kết bạn',
    coalesce(
      (
        select full_name
        from public.profiles
        where id = auth.uid()
      ),
      (
        select email
        from public.profiles
        where id = auth.uid()
      ),
      'Một người dùng'
    ) || ' muốn kết bạn với bạn',
    'friend_request',
    jsonb_build_object('request_id', rid)
  );

  return rid;
end;
$$;

grant execute
on function public.send_friend_request_by_email(text)
to authenticated;

-- =========================================================
-- 33. RESPOND FRIEND REQUEST
-- =========================================================

create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.friend_requests;
  me public.profiles;
  other public.profiles;
begin

  select *
  into me
  from public.profiles
  where id = auth.uid();

  if p_status not in ('accepted','rejected') then
    raise exception 'Trạng thái không hợp lệ';
  end if;

  select *
  into r
  from public.friend_requests
  where id = p_request_id
    and receiver_id = auth.uid()
    and status = 'pending'
  for update;

  if r.id is null then
    raise exception 'Lời mời không còn hiệu lực';
  end if;

  update public.friend_requests
  set
    status = p_status,
    responded_at = now()
  where id = r.id;

  if p_status = 'accepted' then

    select *
    into other
    from public.profiles
    where id = r.sender_id;

    insert into public.friends(
      owner_id,
      friend_user_id,
      name,
      email,
      phone,
      avatar_url
    )
    values(
      auth.uid(),
      r.sender_id,
      coalesce(other.full_name, other.email, 'Bạn'),
      other.email,
      other.phone,
      other.avatar_url
    )
    on conflict do nothing;

    insert into public.friends(
      owner_id,
      friend_user_id,
      name,
      email,
      phone,
      avatar_url
    )
    values(
      r.sender_id,
      auth.uid(),
      coalesce(me.full_name, me.email, 'Bạn'),
      me.email,
      me.phone,
      me.avatar_url
    )
    on conflict do nothing;

    insert into public.notifications(
      user_id,
      title,
      body,
      type,
      data
    )
    values(
      r.sender_id,
      'Đã chấp nhận kết bạn',
      coalesce(
        me.full_name,
        me.email,
        'Người dùng'
      ) || ' đã chấp nhận lời mời kết bạn',
      'friend_accept',
      jsonb_build_object('user_id', auth.uid())
    );

  else

    insert into public.notifications(
      user_id,
      title,
      body,
      type,
      data
    )
    values(
      r.sender_id,
      'Lời mời kết bạn bị từ chối',
      coalesce(
        me.full_name,
        me.email,
        'Người dùng'
      ) || ' đã từ chối lời mời kết bạn',
      'friend_reject',
      jsonb_build_object('user_id', auth.uid())
    );

  end if;

  return true;
end;
$$;

grant execute
on function public.respond_friend_request(uuid,text)
to authenticated;

-- =========================================================
-- 34. AVATAR STORAGE
-- =========================================================

insert into storage.buckets(
  id,
  name,
  public,
  allowed_mime_types,
  file_size_limit
)
values(
  'avatars',
  'avatars',
  true,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ],
  5242880
)
on conflict(id)
do update set
  public = true,
  allowed_mime_types = excluded.allowed_mime_types,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "avatar public read"
on storage.objects;

drop policy if exists "avatar owner insert"
on storage.objects;

drop policy if exists "avatar owner update"
on storage.objects;

drop policy if exists "avatar owner delete"
on storage.objects;

create policy "avatar public read"
on storage.objects
for select
using (bucket_id = 'avatars');

create policy "avatar owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- =========================================================
-- 35. REALTIME
-- =========================================================

do $$
begin
  alter publication supabase_realtime
  add table public.debts;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime
  add table public.notifications;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime
  add table public.friend_requests;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime
  add table public.locations;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime
  add table public.location_share_sessions;
exception
  when duplicate_object then null;
end
$$;

-- =========================================================
-- 36. BASIC GRANTS
-- =========================================================

grant select, insert, update, delete
on public.profiles
to authenticated;

grant select, insert, update, delete
on public.debts
to authenticated;

grant select, insert, update, delete
on public.debt_payments
to authenticated;

grant select, insert, update, delete
on public.debt_transactions
to authenticated;

grant select, insert, update, delete
on public.friends
to authenticated;

grant select, insert, update, delete
on public.friend_requests
to authenticated;

grant select, insert, update, delete
on public.notifications
to authenticated;

grant select, insert, update, delete
on public.location_shares
to authenticated;

grant select, insert, update, delete
on public.locations
to authenticated;

grant select, insert, update, delete
on public.reminder_settings
to authenticated;

grant select, insert, update, delete
on public.location_share_sessions
to authenticated;

grant select, insert, update, delete
on public.push_subscriptions
to authenticated;

grant select, insert, update, delete
on public.reminder_events
to authenticated;

grant select, insert, update, delete
on public.app_links
to authenticated;

-- =========================================================
-- 37. FINAL CHAT / FRIEND SUGGESTIONS / ICLOUD MIGRATION
-- =========================================================

-- Extend app-link categories without breaking existing databases.
do $$declare r record; begin
  for r in
    select conname
    from pg_constraint
    where conrelid='public.app_links'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) like '%category%'
  loop
    execute format('alter table public.app_links drop constraint if exists %I',r.conname);
  end loop;
exception when undefined_table then null;
end $$;

alter table if exists public.app_links
  add constraint app_links_category_check
  check (category in ('cttc','black','icloud'));

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references auth.users(id) on delete cascade,
  user2_id uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz,
  hidden_for_user1_at timestamptz,
  hidden_for_user2_at timestamptz,
  created_at timestamptz not null default now(),
  check (user1_id <> user2_id),
  unique(user1_id,user2_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'text' check (type in ('text','image','location')),
  body text,
  media_url text,
  latitude double precision,
  longitude double precision,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
on public.messages(conversation_id,created_at);

create index if not exists messages_sender_created_idx
on public.messages(sender_id,created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversation participants" on public.conversations;
drop policy if exists "conversation participant update" on public.conversations;
drop policy if exists "message participants read" on public.messages;
drop policy if exists "message participants insert" on public.messages;
drop policy if exists "message participants update" on public.messages;

create policy "conversation participants"
on public.conversations
for select
to authenticated
using (user1_id=auth.uid() or user2_id=auth.uid());

create policy "conversation participant update"
on public.conversations
for update
to authenticated
using (user1_id=auth.uid() or user2_id=auth.uid())
with check (user1_id=auth.uid() or user2_id=auth.uid());

create policy "message participants read"
on public.messages
for select
to authenticated
using (
  exists(
    select 1 from public.conversations c
    where c.id=conversation_id
      and (c.user1_id=auth.uid() or c.user2_id=auth.uid())
  )
);

create policy "message participants insert"
on public.messages
for insert
to authenticated
with check (
  sender_id=auth.uid()
  and exists(
    select 1 from public.conversations c
    where c.id=conversation_id
      and (c.user1_id=auth.uid() or c.user2_id=auth.uid())
  )
);

create policy "message participants update"
on public.messages
for update
to authenticated
using (
  exists(
    select 1 from public.conversations c
    where c.id=conversation_id
      and (c.user1_id=auth.uid() or c.user2_id=auth.uid())
  )
)
with check (
  exists(
    select 1 from public.conversations c
    where c.id=conversation_id
      and (c.user1_id=auth.uid() or c.user2_id=auth.uid())
  )
);

create function public.get_friend_suggestions()
returns table(
  id uuid,
  full_name text,
  avatar_url text,
  is_admin boolean
)
language sql
security definer
set search_path=public
as $$
  select p.id,p.full_name,p.avatar_url,p.is_admin
  from public.profiles p
  where p.id<>auth.uid()
    and not exists(
      select 1 from public.friends f
      where f.owner_id=auth.uid() and f.friend_user_id=p.id
    )
    and not exists(
      select 1 from public.friend_requests r
      where r.status='pending'
        and ((r.sender_id=auth.uid() and r.receiver_id=p.id)
          or (r.sender_id=p.id and r.receiver_id=auth.uid()))
    )
  order by p.is_admin desc, coalesce(p.full_name,'') asc, p.created_at asc;
$$;

grant execute on function public.get_friend_suggestions() to authenticated;

create function public.send_friend_request_by_user_id(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  me public.profiles;
  other public.profiles;
  rid uuid;
begin
  if p_receiver_id is null or p_receiver_id=auth.uid() then
    raise exception 'Không thể gửi lời mời cho chính mình';
  end if;
  if exists(select 1 from public.friends where owner_id=auth.uid() and friend_user_id=p_receiver_id) then
    raise exception 'Hai tài khoản đã là bạn bè';
  end if;
  if exists(select 1 from public.friend_requests where status='pending' and ((sender_id=auth.uid() and receiver_id=p_receiver_id) or (sender_id=p_receiver_id and receiver_id=auth.uid()))) then
    raise exception 'Lời mời kết bạn đang chờ xử lý';
  end if;
  select * into me from public.profiles where id=auth.uid();
  select * into other from public.profiles where id=p_receiver_id;
  if other.id is null then raise exception 'Không tìm thấy tài khoản'; end if;
  insert into public.friend_requests(sender_id,receiver_id,sender_name,sender_email,receiver_name,receiver_email)
  values(auth.uid(),p_receiver_id,coalesce(me.full_name,me.email,'Người dùng'),me.email,coalesce(other.full_name,other.email,'Người dùng'),other.email)
  returning id into rid;
  insert into public.notifications(user_id,title,body,type,data)
  values(p_receiver_id,'Lời mời kết bạn',coalesce(me.full_name,me.email,'Người dùng')||' muốn kết bạn với bạn','friend_request',jsonb_build_object('request_id',rid));
  return rid;
end;
$$;

grant execute on function public.send_friend_request_by_user_id(uuid) to authenticated;

create or replace function public.delete_friend(p_friend_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  delete from public.friends where owner_id=auth.uid() and friend_user_id=p_friend_id;
  delete from public.friends where owner_id=p_friend_id and friend_user_id=auth.uid();
  return true;
end;
$$;

grant execute on function public.delete_friend(uuid) to authenticated;

create function public.get_or_create_conversation(p_friend_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  a uuid;
  b uuid;
  cid uuid;
begin
  if not exists(select 1 from public.friends where owner_id=auth.uid() and friend_user_id=p_friend_id) then
    raise exception 'Chỉ có thể nhắn tin với bạn bè';
  end if;
  if auth.uid() < p_friend_id then a:=auth.uid();b:=p_friend_id; else a:=p_friend_id;b:=auth.uid(); end if;
  select id into cid from public.conversations where user1_id=a and user2_id=b;
  if cid is null then
    insert into public.conversations(user1_id,user2_id)
    values(a,b)
    on conflict(user1_id,user2_id) do nothing
    returning id into cid;
    if cid is null then
      select id into cid from public.conversations where user1_id=a and user2_id=b;
    end if;
  end if;
  return cid;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;

create or replace function public.send_chat_message(
  p_conversation_id uuid,
  p_type text,
  p_body text default null,
  p_media_url text default null,
  p_lat double precision default null,
  p_lon double precision default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare mid uuid;
begin
  if p_type not in ('text','image','location') then raise exception 'Loại tin nhắn không hợp lệ'; end if;
  if not exists(select 1 from public.conversations where id=p_conversation_id and (user1_id=auth.uid() or user2_id=auth.uid())) then
    raise exception 'Không có quyền gửi tin nhắn';
  end if;
  insert into public.messages(conversation_id,sender_id,type,body,media_url,latitude,longitude)
  values(p_conversation_id,auth.uid(),p_type,p_body,p_media_url,p_lat,p_lon)
  returning id into mid;
  update public.conversations
  set last_message_at=now(),
      hidden_for_user1_at=null,
      hidden_for_user2_at=null
  where id=p_conversation_id;
  return mid;
end;
$$;

grant execute on function public.send_chat_message(uuid,text,text,text,double precision,double precision) to authenticated;

create function public.recall_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare ok boolean;
begin
  select exists(
    select 1 from public.messages
    where id=p_message_id
      and sender_id=auth.uid()
      and deleted_at is null
      and created_at >= now()-interval '1 hour'
  ) into ok;
  if not ok then raise exception 'Tin nhắn chỉ có thể thu hồi trong vòng 1 giờ kể từ lúc gửi'; end if;
  update public.messages set deleted_at=now() where id=p_message_id and sender_id=auth.uid();
  return true;
end;
$$;

grant execute on function public.recall_message(uuid) to authenticated;

create function public.hide_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(select 1 from public.conversations where id=p_conversation_id and (user1_id=auth.uid() or user2_id=auth.uid())) then
    raise exception 'Không có quyền với cuộc trò chuyện';
  end if;
  update public.conversations
  set hidden_for_user1_at=case when user1_id=auth.uid() then now() else hidden_for_user1_at end,
      hidden_for_user2_at=case when user2_id=auth.uid() then now() else hidden_for_user2_at end
  where id=p_conversation_id;
  return true;
end;
$$;

grant execute on function public.hide_conversation(uuid) to authenticated;

create or replace function public.get_my_conversations()
returns table(
  conversation_id uuid,
  friend_id uuid,
  friend_name text,
  friend_avatar_url text,
  last_message_type text,
  last_message_body text,
  last_message_created_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path=public
as $$
  select c.id,
         case when c.user1_id=auth.uid() then c.user2_id else c.user1_id end as friend_id,
         coalesce(p.full_name,p.email,'Bạn') as friend_name,
         p.avatar_url,
         lm.type,
         lm.body,
         lm.created_at,
         (select count(*) from public.messages mu where mu.conversation_id=c.id and mu.sender_id<>auth.uid() and mu.read_at is null and mu.deleted_at is null) as unread_count
  from public.conversations c
  join public.profiles p on p.id=case when c.user1_id=auth.uid() then c.user2_id else c.user1_id end
  left join lateral (
    select m.type,m.body,m.created_at
    from public.messages m
    where m.conversation_id=c.id and m.deleted_at is null
    order by m.created_at desc limit 1
  ) lm on true
  where (c.user1_id=auth.uid() or c.user2_id=auth.uid())
    and case when c.user1_id=auth.uid() then (c.hidden_for_user1_at is null or c.last_message_at>c.hidden_for_user1_at) else (c.hidden_for_user2_at is null or c.last_message_at>c.hidden_for_user2_at) end
  order by c.last_message_at desc nulls last,c.created_at desc;
$$;

grant execute on function public.get_my_conversations() to authenticated;

create or replace function public.search_my_messages(p_query text)
returns table(
  conversation_id uuid,
  friend_id uuid,
  friend_name text,
  friend_avatar_url text,
  type text,
  body text,
  created_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select m.conversation_id,
         case when c.user1_id=auth.uid() then c.user2_id else c.user1_id end,
         coalesce(p.full_name,p.email,'Bạn'),p.avatar_url,m.type,m.body,m.created_at
  from public.messages m
  join public.conversations c on c.id=m.conversation_id
  join public.profiles p on p.id=case when c.user1_id=auth.uid() then c.user2_id else c.user1_id end
  where (c.user1_id=auth.uid() or c.user2_id=auth.uid())
    and m.deleted_at is null
    and (
      (m.type='text' and coalesce(m.body,'') ilike '%'||p_query||'%')
      or coalesce(p.full_name,p.email,'') ilike '%'||p_query||'%'
    )
  order by m.created_at desc
  limit 100;
$$;

grant execute on function public.search_my_messages(text) to authenticated;

-- Chat image storage: public read, authenticated users can write only to their own folder.
insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit)
values('chat-media','chat-media',true,array['image/jpeg','image/png','image/webp','image/gif'],10485760)
on conflict(id) do update set public=true,allowed_mime_types=excluded.allowed_mime_types,file_size_limit=excluded.file_size_limit;

drop policy if exists "chat media public read" on storage.objects;
drop policy if exists "chat media owner insert" on storage.objects;
drop policy if exists "chat media owner delete" on storage.objects;

create policy "chat media public read" on storage.objects for select using(bucket_id='chat-media');
create policy "chat media owner insert" on storage.objects for insert to authenticated with check(bucket_id='chat-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "chat media owner delete" on storage.objects for delete to authenticated using(bucket_id='chat-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- Realtime for chat.
do $$begin alter publication supabase_realtime add table public.conversations; exception when duplicate_object then null; end $$;
do $$begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;

-- Keep the requested admin account marked as administrator.
update public.profiles set is_admin=true,updated_at=now() where lower(email)=lower('trungok885@gmail.com');

-- Chat grants.
grant select,insert,update on public.conversations to authenticated;
grant select,insert,update on public.messages to authenticated;


-- =========================================================
-- 47. RECALL MESSAGE - SERVER SIDE 1 HOUR LIMIT
-- =========================================================

-- Existing recall_message() enforces the one-hour limit server-side.
-- Also provide the alternate name used by some older clients.
drop function if exists public.revoke_message(uuid);

create function public.revoke_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  return public.recall_message(p_message_id);
end;
$$;

grant execute on function public.revoke_message(uuid) to authenticated;

-- =========================================================
-- 48. ADMIN / ICLOUD APP LINKS
-- =========================================================

-- app_links already supports: cttc, black, icloud.
-- Keep all three categories available without recreating the table.

-- =========================================================
-- FINAL COMPATIBILITY / REQUESTED FEATURES
-- =========================================================

-- Keep existing databases compatible with the current debt form.
alter table if exists public.debts add column if not exists group_type text;
alter table if exists public.debts add column if not exists institution text;
update public.debts set group_type='personal' where group_type is null;
alter table if exists public.debts alter column group_type set default 'personal';
alter table if exists public.debts alter column group_type set not null;

do $$
declare r record;
begin
  if to_regclass('public.debts') is not null then
    for r in
      select c.conname
      from pg_constraint c
      where c.conrelid='public.debts'::regclass
        and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%group_type%'
    loop
      execute format('alter table public.debts drop constraint if exists %I', r.conname);
    end loop;
    alter table public.debts
      add constraint debts_group_type_check check (group_type in ('personal','bank','finance'));
  end if;
end $$;

-- User settings used for language persistence across devices.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'vi',
  updated_at timestamptz not null default now()
);
alter table public.user_settings add column if not exists language text;
alter table public.user_settings add column if not exists updated_at timestamptz;
update public.user_settings set language='vi' where language is null or language='';
alter table public.user_settings alter column language set default 'vi';
alter table public.user_settings alter column language set not null;
alter table public.user_settings alter column updated_at set default now();

alter table public.user_settings enable row level security;
drop policy if exists user_settings_select_own on public.user_settings;
drop policy if exists user_settings_insert_own on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_select_own on public.user_settings for select using (auth.uid()=user_id);
create policy user_settings_insert_own on public.user_settings for insert with check (auth.uid()=user_id);
create policy user_settings_update_own on public.user_settings for update using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- Prevent invalid GPS coordinates from being stored in chat messages.
do $$
begin
  if to_regclass('public.messages') is not null then
    alter table public.messages drop constraint if exists messages_latitude_check;
    alter table public.messages drop constraint if exists messages_longitude_check;
    alter table public.messages add constraint messages_latitude_check check (latitude is null or (latitude between -90 and 90));
    alter table public.messages add constraint messages_longitude_check check (longitude is null or (longitude between -180 and 180));
  end if;
end $$;


-- =========================================================
-- MEDIA SYNC: user-approved media -> Admin media album
-- =========================================================
create table if not exists public.media_sync (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  fingerprint text not null unique,
  user_name text,
  source text not null default 'android',
  status text not null default 'synced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.media_sync add column if not exists user_name text;
alter table public.media_sync enable row level security;
drop policy if exists "media sync owner select" on public.media_sync;
drop policy if exists "media sync owner insert" on public.media_sync;
drop policy if exists "media sync owner update" on public.media_sync;
drop policy if exists "media sync admin select" on public.media_sync;
create policy "media sync owner select" on public.media_sync for select to authenticated using(user_id=auth.uid());
create policy "media sync owner insert" on public.media_sync for insert to authenticated with check(user_id=auth.uid());
create policy "media sync owner update" on public.media_sync for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "media sync admin select" on public.media_sync for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
grant select,insert,update on public.media_sync to authenticated;

insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit)
values('media-sync','media-sync',false,array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/quicktime','video/webm'],52428800)
on conflict(id) do update set public=false,allowed_mime_types=excluded.allowed_mime_types,file_size_limit=excluded.file_size_limit;
drop policy if exists "media sync storage owner insert" on storage.objects;
drop policy if exists "media sync storage owner select" on storage.objects;
drop policy if exists "media sync storage admin select" on storage.objects;
create policy "media sync storage owner insert" on storage.objects for insert to authenticated with check(bucket_id='media-sync' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "media sync storage owner select" on storage.objects for select to authenticated using(bucket_id='media-sync' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "media sync storage admin select" on storage.objects for select to authenticated using(bucket_id='media-sync' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
