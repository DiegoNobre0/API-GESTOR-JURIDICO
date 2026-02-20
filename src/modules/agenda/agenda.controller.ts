import type { FastifyReply, FastifyRequest } from 'fastify';
import { AgendaService } from './agenda.service.js';
import { createCompromissoSchema, createTarefaSchema } from './dto/agenda.dto.js';


export class AgendaController {
  private agendaService = new AgendaService();

  // Criar Compromisso (Audiências, Reuniões)
  async create(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub; 
    const data = createCompromissoSchema.parse(request.body);

    // ✅ CORREÇÃO: Mudar de .create para .createCompromisso
    const compromisso = await this.agendaService.createCompromisso(data, userId);
    return reply.status(201).send(compromisso);
  }

  // Criar Tarefa (Checklist de prazos)
  async createTarefa(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;
    const data = createTarefaSchema.parse(request.body);

    const tarefa = await this.agendaService.addTarefa(data, userId);
    return reply.status(201).send(tarefa);
  }

  // Listagem Completa (Compromissos + Tarefas)
  async list(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.sub;
    // O service usa Promise.all para performance máxima
    const agenda = await this.agendaService.listAll(userId);
    return reply.send(agenda);
  }

  // Concluir/Toggle de Tarefa
  async toggleTarefa(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const tarefa = await this.agendaService.completeTarefa(id);
    return reply.send(tarefa);
  }

  // Deletar Compromisso
  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    await this.agendaService.delete(id);
    return reply.status(204).send();
  }
}