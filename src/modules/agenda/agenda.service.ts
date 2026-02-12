import { prisma } from "@/lib/prisma.js";

export class AgendaService {
  // Criar Compromisso (Audiência/Reunião)
  async createCompromisso(data: any, userId: string) {
    return prisma.compromisso.create({
      data: {
        ...data,
        userId, // Vincula ao ID do advogado logado
      },
      include: { user: { select: { nome: true } } } // Retorna com o nome do criador
    });
  }

  // Criar Tarefa (Petição/Prazo)
  async createTarefa(data: any, userId: string) {
    return prisma.tarefa.create({
      data: {
        ...data,
        userId, // Vincula ao ID do advogado logado
        concluida: false
      },
      include: { user: { select: { nome: true } } }
    });
  }

  // Criar Tarefa - Vincula o userId automaticamente
  async addTarefa(data: any, userId: string) {
    return prisma.tarefa.create({
      data: {
        ...data,
        userId, // ID do advogado logado
        concluida: false
      },
      // Opcional: já retorna com o nome do criador
      include: {
        user: { select: { nome: true } }
      }
    });
  }

  // MÉTODO ADICIONADO: Concluir Tarefa
  async completeTarefa(id: string) {
    return prisma.tarefa.update({
      where: { id },
      data: { concluida: true }
    });
  }

  // Listagem Unificada com Nome do Advogado
  async listAll(userId: string) {
    const [compromissos, tarefas] = await Promise.all([
      prisma.compromisso.findMany({
        where: { userId },
        orderBy: { startDate: 'asc' },
        include: { user: { select: { nome: true } } } // Inclui o nome do User
      }),
      prisma.tarefa.findMany({
        where: { userId, concluida: false },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { nome: true } } } // Inclui o nome do User
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