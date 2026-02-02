import { PrismaAgendaRepository } from "../../infra/db/prisma-agenda-repository";

export class ManageAgendaUseCase {
  constructor(private agendaRepo: PrismaAgendaRepository) {}

  async addCompromisso(data: any, userId: string) {
    return await this.agendaRepo.createCompromisso({ ...data, userId });
  }

  async addTarefa(data: any, userId: string) {
    return await this.agendaRepo.createTarefa({ ...data, userId });
  }

  async fetchAll(userId: string) {
    const [compromissos, tarefas] = await Promise.all([
      this.agendaRepo.listCompromissos(userId),
      this.agendaRepo.listTarefas(userId)
    ]);
    return { compromissos, tarefas };
  }
}