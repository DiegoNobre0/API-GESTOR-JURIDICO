import type { FastifyReply, FastifyRequest } from "fastify";
import { DashboardService } from "./dashboard.service.js";

export class DashboardController {
  constructor(private dashboardService: DashboardService) { }

  // Busca TUDO
  async getStats(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;

    // Captura as datas enviadas pelo Angular
    const query = request.query as { dataInicial?: string, dataFinal?: string };

    const stats = await this.dashboardService.getStats(userId, query.dataInicial, query.dataFinal);
    return reply.send(stats);
  }

  async updateMeta(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as { metaAnual: number };

      if (body.metaAnual === undefined) {
        return reply.status(400).send({ error: "A propriedade 'metaAnual' é obrigatória." });
      }

      const updated = await this.dashboardService.atualizarMeta(body.metaAnual);
      return reply.send({ success: true, meta: updated.metaFaturamento });
    } catch (error) {
      console.error("Erro ao atualizar a meta:", error);
      return reply.status(500).send({ error: "Erro interno ao atualizar a meta." });
    }
  }


  // Método para o GET
  async getMeta(request: FastifyRequest, reply: FastifyReply) {
    try {
      const config = await this.dashboardService.criarMeta();
      return reply.send(config);
    } catch (error) {
      console.error("Erro ao buscar configurações do escritório:", error);
      return reply.status(500).send({ error: "Erro interno ao buscar configurações." });
    }
  }
}