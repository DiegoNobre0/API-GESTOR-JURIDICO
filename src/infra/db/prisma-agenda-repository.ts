import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class PrismaAgendaRepository {
  // Compromissos
  async createCompromisso(data: any) {
    return await prisma.compromisso.create({ data });
  }

  async listCompromissos(userId: string) {
    return await prisma.compromisso.findMany({
      where: { userId },
      orderBy: { startDate: 'asc' }
    });
  }

  // Tarefas
  async createTarefa(data: any) {
    return await prisma.tarefa.create({ data });
  }

  async listTarefas(userId: string) {
    return await prisma.tarefa.findMany({
      where: { userId, concluida: false },
      orderBy: { createdAt: 'desc' }
    });
  }

  async completeTarefa(id: string) {
    return await prisma.tarefa.update({
      where: { id },
      data: { concluida: true }
    });
  }
}