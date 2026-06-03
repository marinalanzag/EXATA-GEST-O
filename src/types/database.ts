export type UserRole = 'gestor' | 'proprietario' | 'inquilino'
export type PropertyStatus = 'disponivel' | 'locado' | 'manutencao'
export type GuaranteeType = 'caucao' | 'fiador' | 'seguro_fianca'
export type BoletoStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado'
export type InspectionType = 'entrada' | 'saida'
export type ExpenseCategory = 'iptu' | 'condominio' | 'manutencao' | 'seguro' | 'outros'
export type ExpensePayer = 'empresa' | 'inquilino'

export interface Profile {
  id: string
  email: string
  nome: string
  telefone: string
  cpf_cnpj?: string | null
  residente?: string | null
  role: UserRole
  created_at: string
}

export interface Property {
  id: string
  endereco: string
  numero: string
  complemento?: string
  bairro: string
  cidade: string
  estado: string
  cep: string
  tipo: string
  proprietario_id: string
  status: PropertyStatus
  despesas_pagas_por: ExpensePayer
  observacoes?: string
  created_at: string
  proprietario?: Profile
}

export type CaucaoFormaPagamento = 'dinheiro' | 'transferencia' | 'cheque' | 'deposito' | 'outro'

export interface Contract {
  id: string
  imovel_id: string
  inquilino_id: string
  valor_aluguel: number
  data_inicio: string
  data_fim: string
  tipo_garantia: GuaranteeType
  caucao_valor?: number | null
  caucao_forma_pagamento?: CaucaoFormaPagamento | null
  arquivo_url?: string
  ativo: boolean
  observacoes?: string
  created_at: string
  imovel?: Property
  inquilino?: Profile
}

export interface Inspection {
  id: string
  imovel_id: string
  contrato_id: string
  tipo: InspectionType
  data: string
  observacoes?: string
  pdf_url?: string | null
  created_at: string
  imovel?: Property
  fotos?: InspectionPhoto[]
}

export interface InspectionPhoto {
  id: string
  vistoria_id: string
  url: string
  descricao?: string
  comodo: string
  created_at: string
}

export interface Expense {
  id: string
  imovel_id: string
  categoria: ExpenseCategory
  descricao: string
  valor: number
  data_vencimento: string
  data_pagamento?: string
  pago: boolean
  pago_por: ExpensePayer
  numero_nf?: string | null
  xml_nf_url?: string | null
  created_at: string
  imovel?: Property
}

export interface Boleto {
  id: string
  contrato_id: string
  valor: number
  data_vencimento: string
  data_pagamento?: string
  status: BoletoStatus
  nosso_numero?: string
  linha_digitavel?: string
  codigo_barras?: string
  url_pdf?: string
  referencia_mes: string
  created_at: string
  contrato?: Contract
}

export type InvoiceTipo = 'aluguel' | 'airbnb'

export interface Invoice {
  id: string
  contrato_id?: string | null
  imovel_id?: string | null
  tipo: InvoiceTipo
  numero_nf: string
  arquivo_url: string
  xml_url?: string | null
  referencia_mes: string
  valor: number
  data_emissao: string
  created_at: string
  contrato?: Contract
  imovel?: Property
}

export interface Notification {
  id: string
  destinatario_id: string
  tipo: string
  titulo: string
  mensagem: string
  lida: boolean
  created_at: string
}
