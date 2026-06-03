-- =============================================
-- EXATA NEGÓCIOS IMOBILIÁRIOS - Schema do Banco
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- Enum types
CREATE TYPE user_role AS ENUM ('gestor', 'proprietario', 'inquilino');
CREATE TYPE property_status AS ENUM ('disponivel', 'locado', 'manutencao');
CREATE TYPE guarantee_type AS ENUM ('caucao', 'fiador', 'seguro_fianca');
CREATE TYPE boleto_status AS ENUM ('pendente', 'pago', 'vencido', 'cancelado');
CREATE TYPE inspection_type AS ENUM ('entrada', 'saida');
CREATE TYPE expense_category AS ENUM ('iptu', 'condominio', 'manutencao', 'seguro', 'outros');
CREATE TYPE expense_payer AS ENUM ('empresa', 'inquilino');

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'inquilino',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Properties (Imóveis)
CREATE TABLE properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endereco TEXT NOT NULL,
  numero TEXT NOT NULL,
  complemento TEXT,
  bairro TEXT NOT NULL,
  cidade TEXT NOT NULL DEFAULT 'Sete Lagoas',
  estado TEXT NOT NULL DEFAULT 'MG',
  cep TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Residencial',
  proprietario_id UUID REFERENCES profiles(id) NOT NULL,
  status property_status NOT NULL DEFAULT 'disponivel',
  despesas_pagas_por expense_payer NOT NULL DEFAULT 'empresa',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contracts (Contratos)
CREATE TABLE contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  imovel_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  inquilino_id UUID REFERENCES profiles(id) NOT NULL,
  valor_aluguel DECIMAL(10,2) NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  tipo_garantia guarantee_type NOT NULL,
  arquivo_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inspections (Vistorias)
CREATE TABLE inspections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  imovel_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  contrato_id UUID REFERENCES contracts(id) ON DELETE CASCADE NOT NULL,
  tipo inspection_type NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inspection Photos (Fotos de Vistoria)
CREATE TABLE inspection_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vistoria_id UUID REFERENCES inspections(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  descricao TEXT,
  comodo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expenses (Despesas)
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  imovel_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  categoria expense_category NOT NULL,
  descricao TEXT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  pago BOOLEAN NOT NULL DEFAULT FALSE,
  pago_por expense_payer NOT NULL DEFAULT 'empresa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Boletos
CREATE TABLE boletos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID REFERENCES contracts(id) ON DELETE CASCADE NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status boleto_status NOT NULL DEFAULT 'pendente',
  nosso_numero TEXT,
  linha_digitavel TEXT,
  codigo_barras TEXT,
  url_pdf TEXT,
  referencia_mes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoices (Notas Fiscais)
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID REFERENCES contracts(id) ON DELETE CASCADE NOT NULL,
  numero_nf TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  referencia_mes TEXT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  destinatario_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: everyone can read, users can update their own
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Gestores can do everything
CREATE POLICY "Gestores full access to properties" ON properties
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gestor'));

-- Proprietários can view their own properties
CREATE POLICY "Proprietarios view own properties" ON properties
  FOR SELECT TO authenticated
  USING (proprietario_id = auth.uid());

-- Gestores full access to contracts
CREATE POLICY "Gestores full access to contracts" ON contracts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gestor'));

-- Inquilinos can view their own contracts
CREATE POLICY "Inquilinos view own contracts" ON contracts
  FOR SELECT TO authenticated
  USING (inquilino_id = auth.uid());

-- Proprietários can view contracts of their properties
CREATE POLICY "Proprietarios view property contracts" ON contracts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM properties WHERE properties.id = contracts.imovel_id AND properties.proprietario_id = auth.uid()
  ));

-- Gestores full access to inspections
CREATE POLICY "Gestores full access to inspections" ON inspections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gestor'));

-- Proprietários can view inspections of their properties
CREATE POLICY "Proprietarios view property inspections" ON inspections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM properties WHERE properties.id = inspections.imovel_id AND properties.proprietario_id = auth.uid()
  ));

-- Gestores full access to inspection photos
CREATE POLICY "Gestores full access to inspection_photos" ON inspection_photos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gestor'));

-- Proprietários can view inspection photos of their properties
CREATE POLICY "Proprietarios view inspection photos" ON inspection_photos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM inspections
    JOIN properties ON properties.id = inspections.imovel_id
    WHERE inspections.id = inspection_photos.vistoria_id AND properties.proprietario_id = auth.uid()
  ));

-- Gestores full access to expenses
CREATE POLICY "Gestores full access to expenses" ON expenses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gestor'));

-- Proprietários can view expenses of their properties
CREATE POLICY "Proprietarios view property expenses" ON expenses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM properties WHERE properties.id = expenses.imovel_id AND properties.proprietario_id = auth.uid()
  ));

-- Gestores full access to boletos
CREATE POLICY "Gestores full access to boletos" ON boletos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gestor'));

-- Inquilinos can view their own boletos
CREATE POLICY "Inquilinos view own boletos" ON boletos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM contracts WHERE contracts.id = boletos.contrato_id AND contracts.inquilino_id = auth.uid()
  ));

-- Proprietários can view boletos of their properties
CREATE POLICY "Proprietarios view property boletos" ON boletos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM contracts
    JOIN properties ON properties.id = contracts.imovel_id
    WHERE contracts.id = boletos.contrato_id AND properties.proprietario_id = auth.uid()
  ));

-- Gestores full access to invoices
CREATE POLICY "Gestores full access to invoices" ON invoices
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gestor'));

-- Inquilinos can view their own invoices
CREATE POLICY "Inquilinos view own invoices" ON invoices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM contracts WHERE contracts.id = invoices.contrato_id AND contracts.inquilino_id = auth.uid()
  ));

-- Proprietários can view invoices of their properties
CREATE POLICY "Proprietarios view property invoices" ON invoices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM contracts
    JOIN properties ON properties.id = contracts.imovel_id
    WHERE contracts.id = invoices.contrato_id AND properties.proprietario_id = auth.uid()
  ));

-- Notifications: users can only see their own
CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT TO authenticated
  USING (destinatario_id = auth.uid());

CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (destinatario_id = auth.uid());

CREATE POLICY "Gestores create notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'gestor'));

-- =============================================
-- Storage Buckets
-- =============================================
-- Run these in the Supabase Dashboard > Storage

-- CREATE BUCKET: contratos (for contract PDFs)
-- CREATE BUCKET: vistorias (for inspection photos)
-- CREATE BUCKET: notas-fiscais (for invoice PDFs)
-- CREATE BUCKET: boletos (for boleto PDFs)

-- =============================================
-- Functions
-- =============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, nome, telefone, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'inquilino')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Index for performance
CREATE INDEX idx_contracts_imovel ON contracts(imovel_id);
CREATE INDEX idx_contracts_inquilino ON contracts(inquilino_id);
CREATE INDEX idx_inspections_imovel ON inspections(imovel_id);
CREATE INDEX idx_expenses_imovel ON expenses(imovel_id);
CREATE INDEX idx_boletos_contrato ON boletos(contrato_id);
CREATE INDEX idx_invoices_contrato ON invoices(contrato_id);
CREATE INDEX idx_notifications_destinatario ON notifications(destinatario_id);
CREATE INDEX idx_properties_proprietario ON properties(proprietario_id);
