import type { FastifyInstance } from "fastify";
import { LeadsController } from "./leads.controller.js";

export async function leadsModule(app: FastifyInstance) {
  const controller = new LeadsController();

  // Define a rota GET /leads (ou apenas / se você registrar com prefixo no main)
  app.get('/', controller.getLeads);
  
  // Exemplo: app.get('/:id', controller.getLeadById);
}