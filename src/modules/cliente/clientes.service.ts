import { prisma } from "../../lib/prisma.js"; // Ajuste o caminho do seu prisma client

export class ClientesService {

  // Buscar por ID
  async findById(id: string) {
    return await prisma.cliente.findUnique({
      where: { id },
      include: {
        processos: {
          select: {
            id: true,
            numeroProcesso: true,
            statusGeral: true,
            descricaoObjeto: true
          }
        }
      }
    });
  }

  // Buscar por Telefone (útil para busca rápida)
  async findByTelefone(telefone: string) {
    return await prisma.cliente.findUnique({
      where: { telefone },
      include: { processos: true }
    });
  }

  // Atualizar dados do cliente (ex: corrigir email)
  async update(id: string, data: any) {
    return await prisma.cliente.update({
      where: { id },
      data: {
        nome: data.nome,
        email: data.email,
        cpf: data.cpf,
        endereco: data.endereco,
        telefone: data.telefone
      }
    });
  }

  // Listar todos (com paginação simples ou filtro)
async list(search?: string) {
    return await prisma.cliente.findMany({
      where: search ? {
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { cpf: { contains: search } },
          { telefone: { contains: search } }
        ]
      } : {},
      // ADICIONE ESTE BLOCO INCLUDE
      include: {
        processos: {
          select: {
            id: true,
            numeroProcesso: true,
            statusGeral: true,
            descricaoObjeto: true
          }
        }
      },
      orderBy: { nome: 'asc' },
      take: 50
    });
  }
}