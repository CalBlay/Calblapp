-- Esquema de referència (PostgreSQL). Només NOT NULL el que heu definit com a obligatori.
-- Adaptable a altres SGBD. Firestore: veure src/lib/dotacio/types.ts

CREATE TABLE dotacio_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  supplier TEXT NOT NULL,
  name TEXT NOT NULL,
  size TEXT NOT NULL,
  supplier_sku TEXT,
  unit TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  min_stock NUMERIC,
  quantity_on_hand NUMERIC,
  notes TEXT,
  epi_review_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE dotacio_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  department TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  hired_at DATE,
  job_title TEXT,
  notes TEXT,
  source TEXT,
  last_import_batch_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  UNIQUE (code)
);

CREATE TABLE dotacio_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES dotacio_products (id) ON DELETE RESTRICT,
  quantity_delta NUMERIC NOT NULL,
  reason TEXT,
  reference TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dotacio_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_department TEXT NOT NULL,
  status TEXT DEFAULT 'submitted',
  requested_by_worker_id UUID REFERENCES dotacio_workers (id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE dotacio_request_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES dotacio_requests (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES dotacio_products (id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  notes TEXT
);

CREATE TABLE dotacio_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES dotacio_workers (id) ON DELETE RESTRICT,
  delivered_at TIMESTAMPTZ DEFAULT now(),
  acknowledgment_ref TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dotacio_delivery_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES dotacio_deliveries (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES dotacio_products (id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  notes TEXT
);

CREATE TABLE dotacio_purchase_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_summary TEXT,
  payload_snapshot JSONB,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_by_user_id TEXT
);

CREATE INDEX idx_dotacio_stock_movements_product ON dotacio_stock_movements (product_id);
CREATE INDEX idx_dotacio_request_lines_request ON dotacio_request_lines (request_id);
CREATE INDEX idx_dotacio_delivery_lines_delivery ON dotacio_delivery_lines (delivery_id);
