import { createServerClient } from './supabase-server'

interface EmailPayload {
  to: string
  subject: string
  html: string
}

export async function sendEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not configured, skipping email')
    return null
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'EXATA Negócios Imobiliários <noreply@resend.dev>',
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  })

  return response.json()
}

export function boletoEmailHtml(inquilinoNome: string, imovelEndereco: string, referencia: string, valor: string, vencimento: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">EXATA Negócios Imobiliários</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px;">Olá, <strong>${inquilinoNome}</strong>!</p>
        <p>Seu boleto referente ao aluguel está disponível:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; color: #6b7280;">Imóvel</td><td style="padding: 8px; font-weight: bold;">${imovelEndereco}</td></tr>
          <tr style="background: #f9fafb;"><td style="padding: 8px; color: #6b7280;">Referência</td><td style="padding: 8px; font-weight: bold;">${referencia}</td></tr>
          <tr><td style="padding: 8px; color: #6b7280;">Valor</td><td style="padding: 8px; font-weight: bold; color: #059669;">${valor}</td></tr>
          <tr style="background: #f9fafb;"><td style="padding: 8px; color: #6b7280;">Vencimento</td><td style="padding: 8px; font-weight: bold;">${vencimento}</td></tr>
        </table>
        <p>Acesse o portal do inquilino para baixar o boleto.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">Este email foi enviado automaticamente. Em caso de dúvidas, entre em contato com a EXATA Negócios Imobiliários.</p>
      </div>
    </div>
  `
}

export function contratoVencendoEmailHtml(gestorNome: string, imovelEndereco: string, inquilinoNome: string, dataFim: string, diasRestantes: number) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Alerta de Contrato</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px;">Olá, <strong>${gestorNome}</strong>!</p>
        <p>O contrato abaixo está vencendo em <strong>${diasRestantes} dias</strong>:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; color: #6b7280;">Imóvel</td><td style="padding: 8px; font-weight: bold;">${imovelEndereco}</td></tr>
          <tr style="background: #f9fafb;"><td style="padding: 8px; color: #6b7280;">Inquilino</td><td style="padding: 8px; font-weight: bold;">${inquilinoNome}</td></tr>
          <tr><td style="padding: 8px; color: #6b7280;">Vencimento</td><td style="padding: 8px; font-weight: bold; color: #ef4444;">${dataFim}</td></tr>
        </table>
        <p>Acesse o sistema para verificar e tomar as providências necessárias.</p>
      </div>
    </div>
  `
}

export async function createNotification(destinatarioId: string, tipo: string, titulo: string, mensagem: string) {
  const supabase = createServerClient()
  return supabase.from('notifications').insert({ destinatario_id: destinatarioId, tipo, titulo, mensagem })
}
