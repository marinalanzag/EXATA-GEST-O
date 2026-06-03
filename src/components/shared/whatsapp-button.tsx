'use client'

import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import { generateWhatsAppUrl } from '@/lib/whatsapp'

interface WhatsAppButtonProps {
  telefone: string
  mensagem: string
  variant?: 'icon' | 'full'
}

export function WhatsAppButton({ telefone, mensagem, variant = 'full' }: WhatsAppButtonProps) {
  const handleClick = () => {
    const url = generateWhatsAppUrl(telefone, mensagem)
    window.open(url, '_blank')
  }

  if (variant === 'icon') {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="text-green-600 hover:text-green-700 hover:bg-green-50"
        onClick={handleClick}
        title="Enviar via WhatsApp"
      >
        <MessageCircle className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      className="border-green-600 text-green-600 hover:bg-green-50 hover:text-green-700"
      onClick={handleClick}
    >
      <MessageCircle className="mr-2 h-4 w-4" />
      Enviar via WhatsApp
    </Button>
  )
}
