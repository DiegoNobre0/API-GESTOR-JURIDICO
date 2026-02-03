export class WhatsAppService {
  private url = `https://graph.facebook.com/v24.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  private headers = {
    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Enviar Texto (com suporte a link preview)
  async sendText(to: string, body: string, preview_url = true) {
    return fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body, preview_url }
      })
    });
  }

  // Marcar como Lido + Indicador de Digitação
  // Isso dá o ar de "profissionalismo" que a RCS Advogados precisa
  async setTyping(to: string, messageId: string) {
    return fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" }
      })
    });
  }

  // Enviar Documento (Petições, Contratos)
  async sendDocument(to: string, docUrl: string, filename: string) {
    return fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: { link: docUrl, filename }
      })
    });
  }
}