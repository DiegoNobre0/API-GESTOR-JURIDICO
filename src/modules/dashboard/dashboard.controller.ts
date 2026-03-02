import type { FastifyReply, FastifyRequest } from "fastify";
import { DashboardService } from "./dashboard.service.js";

export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  // Busca TUDO
  async getStats(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;
    
    // Captura as datas enviadas pelo Angular
    const query = request.query as { dataInicial?: string, dataFinal?: string };
    
    const stats = await this.dashboardService.getStats(userId, query.dataInicial, query.dataFinal);
    return reply.send(stats);
  }

  // Salva a Meta Anual
  async updateMeta(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;
    const body = request.body as { metaAnual: number };
    
    if (body.metaAnual === undefined) {
        return reply.status(400).send({ error: "Meta não informada." });
    }
    
    const updated = await this.dashboardService.atualizarMeta(userId, body.metaAnual);
    return reply.send({ success: true, meta: updated.metaFaturamento });
  }
}