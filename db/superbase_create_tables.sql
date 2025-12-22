create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  invoice_date date,
  amount numeric,
  currency text default 'CNY',
  seller text,
  buyer text,
  invoice_type text,
  description text,
  notes text,
  image_url text not null,
  created_at timestamp with time zone default now()
);

alter table invoices enable row level security;

create policy "allow all"
on invoices
for all
using (true);
