import { prisma } from "../../lib/prisma.js";
import { PasswordHasher } from "../../shared/password-hasher.js";

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

  async getSettings(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, nome: true, email: true, tipo: true,
        numeroOab: true, estadoOab: true,
        notificarAgenda: true, notificarPje: true, horarioNotificacao: true
      }
    });
    if (!user) throw new Error("Usuário não encontrado.");
    return user;
  }

  // Lista a equipe para a Tabela (Aba 2)
  async listTeam() {
    return await prisma.user.findMany({
      where: {
        tipo: { in: ['advogado_admin', 'advogado'] }
      },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        numeroOab: true,
        estadoOab: true,
        cpf: true,
        telefone: true,
        ativo: true
      },
      orderBy: { nome: 'asc' }
    });
  }

  // Atualiza as próprias configurações (Aba 1)
  async updateSettings(id: string, data: any) {
    return await prisma.user.update({
      where: { id },
      data
    });
  }

  // Admin edita membro da equipe (Aba 2)
  async updateTeamMember(id: string, data: any) {
    // Remove o 'id' do objeto data, guardando o resto em 'dadosParaAtualizar'
    const { id: _, ...dadosParaAtualizar } = data;

    return await prisma.user.update({
      where: { id },
      data: dadosParaAtualizar
    });
  }

  // Admin exclui membro da equipe (Aba 2)
  async deleteTeamMember(id: string) {
    return await prisma.user.delete({
      where: { id }
    });
  }

  // ✅ NOVO MÉTODO: Criar usuário internamente (Pelo Admin)
  async createUser(data: any) {
    // 1. Verifica se já existe
    const userExists = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (userExists) throw new Error("Este e-mail já está em uso.");

    // 2. Criptografa a senha gerada pelo Admin
    const hashedPassword = await PasswordHasher.hash(data.senha);

    // 3. Cria no banco
    const user = await prisma.user.create({
      data: {
        ...data,
        senha: hashedPassword
      }
    });

    // 4. Retorna sem a senha
    const { senha: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

}