import type { FastifyReply, FastifyRequest } from "fastify";
import { LeadsService } from "./leads.service.js";


export class LeadsController {
  private leadsService: LeadsService;

  constructor() {
    this.leadsService = new LeadsService();
  }

  // Usamos arrow function aqui para não perder o "this" quando chamado pela rota
  getLeads = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const leads = await this.leadsService.findAll();
      return reply.send(leads);
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ error: 'Erro ao buscar leads' });
    }
  }
}