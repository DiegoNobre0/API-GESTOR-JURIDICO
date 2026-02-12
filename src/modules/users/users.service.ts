import { prisma } from "../../lib/prisma.js";

export class UsersService {
  // Busca o perfil do usuário logado
  async getProfile(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        cpf: true,
        telefone: true,
        createdAt: true
      }
    });

    if (!user) throw new Error("Usuário não encontrado.");
    return user;
  }

  // Lista todos os usuários (útil para o Admin ver advogados/clientes)
  async listAll() {
    return await prisma.user.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        telefone: true
      },
      orderBy: { nome: 'asc' }
    });
  }

  // Busca advogados específicos para o select de "Responsável" no cadastro de processos
  async listLawyers() {
    return await prisma.user.findMany({
      where: {
        tipo: { in: ['advogado_admin', 'advogado'] }
      },
      select: { id: true, nome: true }
    });
  }
}