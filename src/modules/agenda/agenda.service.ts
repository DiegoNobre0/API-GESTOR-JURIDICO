import { prisma } from "@/lib/prisma.js";

export class AgendaService {
  // Criar Compromisso (Audiências, Reuniões)
  async create(data: any, userId: string) {
    return prisma.compromisso.create({
      data: {
        ...data,
        userId,
      },
    });
  }

  // MÉTODO ADICIONADO: Criar Tarefa (Checklist)
  async addTarefa(data: any, userId: string) {
    return prisma.tarefa.create({
      data: {
        ...data,
        userId,
        concluida: false
      },
    });
  }

  // MÉTODO ADICIONADO: Concluir Tarefa
  async completeTarefa(id: string) {
    return prisma.tarefa.update({
      where: { id },
      data: { concluida: true }
    });
  }

  async listAll(userId: string) {
    // Busca paralela para performance máxima no seu Angular 19
    const [compromissos, tarefas] = await Promise.all([
      prisma.compromisso.findMany({
        where: { userId },
        orderBy: { startDate: 'asc' },
      }),
      prisma.tarefa.findMany({
        where: { userId, concluida: false },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { compromissos, tarefas };
  }

  async delete(id: string) {
    return prisma.compromisso.delete({
      where: { id },
    });
  }
}