import type { FastifyInstance } from "fastify";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

export async function dashboardModule(app: FastifyInstance) {
  const service = new DashboardService();
  const controller = new DashboardController(service);

  // No Fastify, usamos o register para criar um novo escopo com prefixo
  app.register(async (group) => {
    
    // O hook de autenticação fica "preso" apenas dentro deste registro
    group.addHook("preHandler", app.authenticate);

    // As rotas aqui dentro herdam o prefixo '/dashboard'
    group.get("/stats", (req, res) => controller.getStats(req, res));
    group.get("/grafico-financeiro", (req, res) => controller.getFinanceiro(req, res));
    group.get("/grafico-processos", (req, res) => controller.getProcessos(req, res));
    group.get("/produtividade", (req, res) => controller.getProdutividade(req, res));

  }, { prefix: '/dashboard' }); // O prefixo é passado como opção no final
}