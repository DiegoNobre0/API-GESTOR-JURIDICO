import type { FastifyInstance } from "fastify";

import { DashboardService } from "./dashboard.service.js";
import { DashboardController } from "./dashboard.controller.js";

export async function dashboardModule(app: FastifyInstance) {
  const service = new DashboardService();
  const controller = new DashboardController(service);

  app.register(async (group) => {
    
    group.addHook("preHandler", app.authenticate);

    // Rota GET única: Retorna KPIs e Dados de todos os Gráficos
    group.get("/stats", (req, res) => controller.getStats(req, res));
    
    // Rota PUT: Salva a edição da meta anual
    group.put("/meta", (req, res) => controller.updateMeta(req, res));

    group.get("/meta", (req, res) => controller.getMeta(req, res));

  }, { prefix: '/dashboard' });
}