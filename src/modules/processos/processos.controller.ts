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

  // async gerarZapSign(request: FastifyRequest, reply: FastifyReply) {
  //   const { nome, cpf, endereco } = request.body as any;

  //   try {
  //     const IDs = {
  //       contrato: "65194d71-ad5d-4192-a2b2-5838f664a6dc",
  //       procuracao: "52151f47-c845-45a7-beae-6cd1042d5ecb"
  //     };

  //     const dados = { nome, cpf, endereco };

  //     // Gera os dois em paralelo para ser mais rápido
  //     const [contrato, procuracao] = await Promise.all([
  //       this.zapSignService.gerarDocumento(dados, IDs.contrato, `Contrato - ${nome}`),
  //       this.zapSignService.gerarDocumento(dados, IDs.procuracao, `Procuração - ${nome}`)
  //     ]);

  //     if (!contrato || !procuracao) {
  //       return reply.status(500).send({ message: "Erro ao gerar um dos documentos no ZapSign." });
  //     }

  //     return reply.send({ contrato, procuracao });
      
  //   } catch (error) {
  //     return reply.status(500).send({ message: "Erro interno ao chamar ZapSign" });
  //   }
  // }
}