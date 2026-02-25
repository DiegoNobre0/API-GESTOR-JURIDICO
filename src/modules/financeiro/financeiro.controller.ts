import { FinanceiroService } from './financeiro.service.js';
import { createFinanceiroSchema } from './dto/create-financeiro.dto.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export class FinanceiroController {
  private service = new FinanceiroService();

  async create(req: FastifyRequest, rep: FastifyReply) {
    const data = createFinanceiroSchema.parse(req.body);
    const userId = req.user.sub; 
    const res = await this.service.create(data, userId);
    return rep.status(201).send(res);
  }

  async list(req: FastifyRequest, rep: FastifyReply) {
    const userId = req.user.sub;
    const items = await this.service.list(userId);
    return rep.send(items);
  }

  // 👇 NOVA ROTA: UPDATE
  async update(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = createFinanceiroSchema.partial().parse(req.body) as any
    const userId = req.user.sub;

    const res = await this.service.update(id, userId, data);
    return rep.send(res);
  }

  async resumo(req: FastifyRequest, rep: FastifyReply) {
    // @ts-ignore
    const stats = await this.service.getResumo(req.user.sub);
    return rep.send(stats);
  }

  // 👇 AJUSTADO: Escuta requisição com parâmetro ex: DELETE /financeiro/:id?lote=true
  async delete(req: FastifyRequest, rep: FastifyReply) {
    const { id } = req.params as { id: string };
    const apagarLote = (req.query as any).lote === 'true'; // Verifica se o Front pediu lote
    
    // @ts-ignore
    await this.service.delete(id, req.user.sub, apagarLote);
    return rep.status(204).send();
  }
}