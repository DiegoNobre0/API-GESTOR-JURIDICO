import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateProcessoFromConversationService } from './create-processo.service.js';


export class ProcessosController {
  
  // Rota: POST /processos/gerar-pela-conversa/:id
  async gerarPelaConversa(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string }; // ID da Conversa
    
    // Aqui simulamos o ID do usuário logado (depois pegaremos do Token JWT)
    const userId = "ID_DO_ADVOGADO_PADRAO"; 

    const service = new CreateProcessoFromConversationService();

    try {
      console.log(`⚙️ Gerando processo a partir da conversa ${id}...`);
      
      const resultado = await service.execute(id, userId);
      
      return rep.status(201).send(resultado);

    } catch (error: any) {
      console.error(error);
      return rep.status(500).send({ 
        error: 'Erro ao gerar processo',
        message: error.message 
      });
    }
  }
}