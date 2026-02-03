import type { FastifyReply, FastifyRequest } from "fastify";
import { DashboardService } from "./dashboard.service.js";

export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  async getStats(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;
    const stats = await this.dashboardService.getStats(userId);
    return reply.send(stats);
  }

  async getFinanceiro(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;
    const data = await this.dashboardService.getGraficoFinanceiro(userId);
    return reply.send(data);
  }

  async getProcessos(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;
    const data = await this.dashboardService.getGraficoProcessos(userId);
    return reply.send(data);
  }

  async getProdutividade(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;
    const data = await this.dashboardService.getProdutividade(userId);
    return reply.send(data);
  }
}