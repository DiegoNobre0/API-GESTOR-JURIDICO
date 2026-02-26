import fetch from 'node-fetch'

const version = 'v24.0'
const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
const token = process.env.WHATSAPP_ACCESS_TOKEN

export async function sendWhatsAppMessage(to: string, text: string) {

  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  })

  const json = await res.json()

  if (!res.ok) {
    console.error('❌ ERRO WHATSAPP:', json)
    throw new Error('Erro envio WhatsApp')
  }

  return json
}