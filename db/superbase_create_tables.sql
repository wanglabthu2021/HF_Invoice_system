create table invoices(
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  invoice_date date,
  orderDate date,
  amount numeric,
  currency text default 'CNY',
  buyerName text,
  contact text,
  sellerOption text,
  sellerOther text,
  invoice_type text,
  description text,
  notes text,
  image_url text not null,
  sign_url text,
  created_at timestamp with time zone default now()
);

alter table invoices_v2 enable row level security;

create policy "allow all"
on invoices_v2
for all
using (true);