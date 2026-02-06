
import type { FastifyReply, FastifyRequest } from "fastify";
import { WhatsappService } from "./whatsapp.service.js";
import { ZapSignService } from "@/infra/services/zapsign-service.js";

export class WhatsappController {
  constructor(private service: WhatsappService) {}

  // --- WEBHOOKS (Meta) ---
  async verifyWebhook(req: FastifyRequest, rep: FastifyReply) {
    const query = req.query as any;
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken) {
      return rep.status(200).send(query['hub.challenge']);
    }
    return rep.status(403).send('Falha na verificação');
  }

  async handleWebhook(req: FastifyRequest, rep: FastifyReply) {
    const body = req.body as any;
    this.service.processWebhook(body).catch(console.error);
    return rep.status(200).send('EVENT_RECEIVED');
  }

  // --- API INTERNA (Para o Angular) ---

  // 1. GET /chat/conversations
  async listConversations(req: FastifyRequest, rep: FastifyReply) {
    try {
      const conversations = await this.service.listarConversas();
      return rep.status(200).send(conversations);
    } catch (error) {
      console.error(error);
      return rep.status(500).send({ error: 'Erro ao listar conversas' });
    }
  }

  // 2. GET /chat/conversations/:id
  async getConversation(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string };
    try {
      const conversation = await this.service.getConversationById(id);
      if (!conversation) return rep.status(404).send({ error: 'Conversa não encontrada' });
      return rep.status(200).send(conversation);
    } catch (error) {
      return rep.status(500).send({ error: 'Erro ao buscar detalhes' });
    }
  }

  // 3. POST /chat/conversations/:id/messages
  async sendMessage(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string }; // ID da conversa
    const { text } = req.body as { text: { body: string } }; // Formato que o front envia

    // O service agora precisa buscar o telefone pelo ID da conversa
    const response = await this.service.sendTextByConversationId(id, text.body);
    return rep.status(200).send(response);
  }

  // 4. POST /chat/conversations/:id/media
  async sendMedia(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = await req.file();
    
    if (!data) return rep.status(400).send('Arquivo não enviado');

    const fs = require('fs');
    const util = require('util');
    const pipeline = util.promisify(require('stream').pipeline);
    const tempPath = `./uploads/${data.filename}`;
    
    await pipeline(data.file, fs.createWriteStream(tempPath));

    const response = await this.service.sendFileByConversationId(
      id,
      tempPath,
      data.mimetype,
      data.filename
    );

    fs.unlinkSync(tempPath);
    return rep.status(200).send(response);
  }

  // 5. POST /chat/conversations/:id/read
  async markAsRead(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string };
    await this.service.markConversationAsRead(id);
    return rep.status(200).send();
  }

  // 6. PATCH /chat/conversations/:id (Atualizar status/atendente)
  async updateConversation(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = req.body as any;
    const updated = await this.service.updateConversation(id, data);
    return rep.status(200).send(updated);
  }

  // 7. PUT /chat/conversations/:id/customer (Atualizar dados do cliente)
  async updateCustomer(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = req.body as { nome: string; telefone: string };
    const updated = await this.service.updateCustomerData(id, data);
    return rep.status(200).send(updated);
  }

  async aprovarContrato(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string }; // ID da conversa
    
    // 1. Busca dados do cliente
    const conversa = await this.service.getConversationById(id);
    if (!conversa) return rep.status(404).send({ error: 'Cliente não encontrado' });

    // 2. Instancia serviços
    const zapsign = new ZapSignService();
    // ID do seu modelo de contrato lá na ZapSign (copie do site deles)
    const TEMPLATE_ID_PROCURACAO = "seu-id-de-template-aqui"; 

    try {
        // 3. Gera o contrato
        const { linkAssinatura } = await zapsign.criarContrato(
            conversa.customerName || 'Cliente', 
            TEMPLATE_ID_PROCURACAO
        );

        // 4. Envia mensagem bonita no WhatsApp
        const mensagem = `Olá, ${conversa.customerName}! 👋\n\n` +
            `O Dr. Leonardo analisou seu caso e *aprovou* o seguimento.\n\n` +
            `Para iniciarmos a ação, preciso que assine a procuração digitalmente. É rápido e pode ser feito na tela do celular:\n\n` +
            `🖋️ *CLIQUE PARA ASSINAR:* ${linkAssinatura}\n\n` +
            `Assim que assinar, eu recebo o aviso aqui e começo a redigir a petição.`;

        await this.service.sendTextByConversationId(id, mensagem);

        // 5. Atualiza status no banco
        await this.service.updateConversation(id, { 
            workflowStep: 'AGUARDANDO_ASSINATURA' 
        });

        return rep.status(200).send({ success: true, link: linkAssinatura });

    } catch (error) {
        console.error(error);
        return rep.status(500).send({ error: 'Erro ao gerar contrato' });
    }
}
}