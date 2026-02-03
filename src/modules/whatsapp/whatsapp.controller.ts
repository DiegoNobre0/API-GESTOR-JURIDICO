import type { ChatbotService } from "@/infra/services/chatbot-service.js";


// src/modules/whatsapp/whatsapp.service.ts
export class WhatsappService {
  constructor(private chatbotService: ChatbotService) {}

  async processIncomingMessage(from: string, text: string) {
    // Mantém o contexto usando o número do celular como ID
    const aiResponse : any = await this.chatbotService.chat(text, from);
    
    // Envia a resposta via API da Meta
    await this.enviarParaMeta(from, aiResponse.response);
  }

  private async enviarParaMeta(to: string, message: string) {
    // Sua lógica de fetch para a API da Meta usando o WHATSAPP_TOKEN
  }
}