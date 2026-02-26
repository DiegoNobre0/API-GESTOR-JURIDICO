// fallback.worker.ts

import { prisma } from "@/lib/prisma.js"
import type { Conversation } from "@prisma/client"
import { sendWhatsAppMessage } from "../services/whatsapp-sender-callback.service.js"



export async function verificarFallbacks() {

  const agora = new Date()

  const conversas = await prisma.conversation.findMany({
    where: {
      workflowStep: { in: ['COLETA_DOCS', 'ASSINATURA'] },
      status: 'OPEN'
    }
  })

  for (const c of conversas) {

    if (!c.lastCustomerMessageAt) continue

    const diffMin = (agora.getTime() - new Date(c.lastCustomerMessageAt).getTime()) / 60000
    const diffHoras = diffMin / 60

    // 🔒 NUNCA enviar fora da janela gratuita do WhatsApp
    if (diffHoras >= 24) continue

    if (c.workflowStep === 'COLETA_DOCS') {

      if (diffMin > 120 && c.fallbackStage === 0) {
        await enviarFallbackDocs1(c)
      }

      else if (diffMin > 720 && c.fallbackStage === 1) {
        await enviarFallbackDocs2(c)
      }
    }

    if (c.workflowStep === 'ASSINATURA') {

      if (diffMin > 60 && c.fallbackStage === 0) {
        await enviarFallbackSign1(c)
      }

      else if (diffMin > 480 && c.fallbackStage === 1) {
        await enviarFallbackSign2(c)
      }
    }
  }
}


async function enviarFallbackDocs1(conversation: Conversation) {

  await sendWhatsAppMessage(
    conversation.customerPhone,
`Oi ${conversation.customerName}

Passando só pra te ajudar com a continuidade do atendimento.

Assim que puder, me envie o documento pendente pra gente seguir com a análise, tá?`
  )

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      fallbackStage: 1,
      lastFallbackAt: new Date()
    }
  })
}


async function enviarFallbackDocs2(conversation: Conversation) {

  await sendWhatsAppMessage(
    conversation.customerPhone,
`Oi ${conversation.customerName}

Só passando pra te ajudar a não perder o andamento do seu caso.

Assim que puder, me envie o documento pendente para seguirmos com a análise.

Se precisar de ajuda pra localizar ou enviar, me avise 👍`
  )

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      fallbackStage: 2,
      lastFallbackAt: new Date()
    }
  })
}


async function enviarFallbackSign1(conversation: Conversation) {

  await sendWhatsAppMessage(
    conversation.customerPhone,
`Oi ${conversation.customerName}

Vi que a assinatura ainda não foi finalizada.

Se tiver qualquer dificuldade, posso te orientar agora rapidinho 👍`
  )

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      fallbackStage: 1,
      lastFallbackAt: new Date()
    }
  })
}

async function enviarFallbackSign2(conversation: Conversation) {

  await sendWhatsAppMessage(
    conversation.customerPhone,
`Oi ${conversation.customerName}

Sua assinatura é o último passo para que possamos iniciar a análise do seu caso.

Se puder finalizar ainda hoje, conseguimos seguir sem atrasos 👍`
  )

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      fallbackStage: 2,
      lastFallbackAt: new Date()
    }
  })
}


export async function testarFallbackAgora(customerPhone: string) {

  const conversa = await prisma.conversation.findUnique({
    where: { customerPhone }
  })

  if (!conversa) {
    console.log("❌ Conversa não encontrada")
    return
  }

  console.log("🧪 TESTE DE FALLBACK INICIADO")

  if (conversa.workflowStep === 'COLETA_DOCS') {
    await enviarFallbackDocs1(conversa)
    return
  }

  if (conversa.workflowStep === 'ASSINATURA') {
    await enviarFallbackSign1(conversa)
    return
  }

  console.log("⚠️ Conversa não está em etapa válida para fallback")
}

export async function resetarFallback(customerPhone: string) {

  await prisma.conversation.update({
    where: { customerPhone },
    data: {
      fallbackStage: 0,
      lastCustomerMessageAt: new Date()
    }
  })

  console.log("🔄 Fallback resetado")
}