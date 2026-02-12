
import { FinanceiroService } from './financeiro.service.js';
import { createFinanceiroSchema } from './dto/create-financeiro.dto.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export class FinanceiroController {
  private service = new FinanceiroService();

async create(req: FastifyRequest, rep: FastifyReply) {
    // 1. Validamos o corpo da requisição com Zod
    const data = createFinanceiroSchema.parse(req.body);
    
    // 2. Pegamos o ID do usuário que veio do Token (injetado pelo app.authenticate)
    // O 'sub' é o padrão do JWT para o ID do usuário
    const userId = req.user.sub; 

    // 3. Chamamos o service passando os dados e o ID do dono da transação
    const res = await this.service.create(data, userId);
    
    return rep.status(201).send(res);
  }
async list(req: FastifyRequest, rep: FastifyReply) {
    const userId = req.user.sub;
    const items = await this.service.list(userId);
    return rep.send(items);
  }

  async resumo(req: FastifyRequest, rep: FastifyReply) {
    // @ts-ignore
    const stats = await this.service.getResumo(req.user.sub);
    return rep.send(stats);
  }

  async delete(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string };
    // @ts-ignore
    await this.service.delete(id, req.user.sub);
    return rep.status(204).send();
  }
}