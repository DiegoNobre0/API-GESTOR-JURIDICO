import type { FastifyInstance } from "fastify";
import { FinanceiroService } from "../financeiro/financeiro.service.js";
import { ChatbotService } from "@/infra/services/chatbot-service.js";

export async function whatsappModule(app: FastifyInstance) {
    const financeiroService = new FinanceiroService();
    const chatbotService = new ChatbotService(financeiroService);

    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

    // 1. Verificação do Webhook (GET)
    app.get("/whatsapp/webhook", async (req, rep) => {
        const query = req.query as any;
        if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === VERIFY_TOKEN) {
            return rep.status(200).send(query["hub.challenge"]);
        }
        return rep.status(403).send();
    });

    // 2. Recebimento de Mensagens (POST)
    app.post("/whatsapp/webhook", async (req, rep) => {
        const body = req.body as any;

        if (body.object === "whatsapp_business_account") {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const message = value?.messages?.[0];

            if (message?.type === "text") {
                const customerPhone = message.from; // Vem como '557181482521'
                const text = message.text.body;

                console.log(`📩 Mensagem recebida de ${customerPhone}: ${text}`); // Log de entrada

                // Processa com a IA (RCS Copilot)
                const aiResponse = await chatbotService.chat(text, "ID_DO_DIEGO_ADMIN");

                app.io.emit("new_whatsapp_message", {
                    body: aiResponse,
                    fromMe: false,
                    type: 'text',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                console.log(`🤖 IA Respondeu: ${aiResponse}`); // Log da IA para debug

                // Dispara a resposta corrigindo o número
                await sendWhatsAppMessage(customerPhone, aiResponse);
            }
        }

        return rep.status(200).send("EVENT_RECEIVED");
    });
}

/**
 * Função ajustada para garantir o formato exigido pela Meta (13 dígitos para Brasil)
 */
// Teste de "Espelho": responde exatamente para o ID que recebeu
async function sendWhatsAppMessage(to: string, text: string) {
    // Comente a lógica do 9 por um momento para testar o ID direto da Meta
    const formattedNumber = to;

    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: formattedNumber, // Enviando para 557181482521 (como veio no wa_id)
            type: "text",
            text: { body: text }
        })
    });
}