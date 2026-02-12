import { prisma } from "@/lib/prisma.js";
import { Prisma } from "@prisma/client";
import { ProcessoEntity } from "./entities/processo.entity.js";
import type { CreateProcessoInput } from "./dto/create-processo.dto.js";

export class ProcessosService {
  
  // -----------------------------------------------------------------------
  // CRIAR PROCESSO
  // -----------------------------------------------------------------------
  
  async create(input: CreateProcessoInput, userId: string) {
    // 1. Regra de Negócio: Duplicidade
    if (input.numeroProcesso) {
      const existe = await prisma.processo.findFirst({ 
        where: { numeroProcesso: input.numeroProcesso } 
      });
      if (existe) throw new Error("Já existe um processo com este número.");
    }

    // 2. Entidade (Validação de Domínio)
    const entity = new ProcessoEntity(input);

    // 3. Gestão do Cliente (Upsert Inteligente)
    let clienteIdConectado: string;

    // LÓGICA: Se tem CPF, usa CPF como chave. Se não, usa Telefone.
    if (input.clienteCpf) {
      const cliente = await prisma.cliente.upsert({
        where: { cpf: input.clienteCpf },
        update: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null, 
          // Opcional: Atualizar telefone se o cliente já existia
          telefone: input.clienteTelefone 
        },
        create: {
          nome: input.clienteNome,
          cpf: input.clienteCpf,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone // <--- USA O TELEFONE REAL
        }
      });
      clienteIdConectado = cliente.id;
    } else {
      // Fallback: Busca/Cria pelo Telefone
      const cliente = await prisma.cliente.upsert({
        where: { telefone: input.clienteTelefone },
        update: {
            nome: input.clienteNome,
            email: input.clienteEmail ?? null,
        },
        create: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone, // <--- USA O TELEFONE REAL
          cpf: null // Sem CPF por enquanto
        }
      });
      clienteIdConectado = cliente.id;
    }

    // 4. Montagem do Payload
    const prismaData: Prisma.ProcessoCreateInput = {
      // --- CAMPOS OBRIGATÓRIOS ---
      descricaoObjeto: entity.props.descricaoObjeto,
      dataFechamentoContrato: entity.props.dataFechamentoContrato,
      responsavel: entity.props.responsavel,
      tipoHonorarios: entity.props.tipoHonorarios,
      statusProtocolamento: entity.props.statusProtocolamento,
      statusGeral: entity.props.statusGeral,
      valorPrevistoIniciais: entity.props.valorPrevistoIniciais,
      valorPrevistoExito: entity.props.valorPrevistoExito,
      custosPrevistos: entity.props.custosPrevistos,
      clienteNome: entity.props.clienteNome,

      // --- CAMPOS OPCIONAIS (NULLABLE) ---
      clienteCpf: entity.props.clienteCpf ?? null,
      clienteEmail: entity.props.clienteEmail ?? null,
      numeroProcesso: entity.props.numeroProcesso ?? null,
      basePrevisao: entity.props.basePrevisao ?? null,
      dataEstimadaRecebimento: entity.props.dataEstimadaRecebimento ?? null,

      // --- CAMPOS COM DEFAULT ---
      ...(entity.props.numeroInterno ? { numeroInterno: entity.props.numeroInterno } : {}),

      // --- CONEXÕES ---
      cliente: { connect: { id: clienteIdConectado } },
      user: { connect: { id: userId } },

      // --- ARQUIVOS (NOVO) ---
      // Cria os arquivos vinculados na tabela processo_arquivos atomicamente
      arquivos: {
        create: input.arquivos?.map(arq => ({
            tipo: arq.tipo,
            url: arq.url,
            nomeArquivo: arq.nomeArquivo
        })) || []
      }
    };

    // Retorna o processo criado já incluindo os arquivos para confirmação visual
    return await prisma.processo.create({ 
        data: prismaData,
        include: { arquivos: true } 
    });
  }

  // -----------------------------------------------------------------------
  // OUTROS MÉTODOS
  // -----------------------------------------------------------------------
  async list(userId: string, arquivado = false) {
    return await prisma.processo.findMany({
      where: { userId, arquivado },
      orderBy: { createdAt: 'desc' },
      include: { cliente: true }
    });
  }

  async findById(id: string, userId: string) {
    return await prisma.processo.findFirst({ 
      where: { id, userId },
      include: { 
          cliente: true,
          arquivos: true // <--- Incluímos os arquivos na busca
      }
    });
  }

  async setArquivado(id: string, userId: string, status: boolean) {
    return await prisma.processo.updateMany({
      where: { id, userId },
      data: { 
        arquivado: status, 
        dataArquivamento: status ? new Date() : null 
      }
    });
  }

  async update(id: string, userId: string, input: any) {
    const processo = await prisma.processo.findFirst({ where: { id, userId } });
    if (!processo) throw new Error("Processo não encontrado.");

    const dataToUpdate = { ...input };
    // Remove campos undefined para não sobrescrever com null acidentalmente
    Object.keys(dataToUpdate).forEach((key) => {
      if (dataToUpdate[key] === undefined) delete dataToUpdate[key];
    });

    return await prisma.processo.update({
      where: { id },
      data: dataToUpdate
    });
  }

  async listAndamentos(processoId: string, userId: string) {
    const processo = await prisma.processo.findFirst({ where: { id: processoId, userId } });
    if (!processo) throw new Error("Processo não encontrado.");
    
    return await prisma.andamento.findMany({
      where: { processoId },
      orderBy: { createdAt: 'desc' },
      include: { user: true }
    });
  }

  async createAndamento(processoId: string, userId: string, data: { tipo: string, descricao: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("Usuário não encontrado");

    return await prisma.andamento.create({
      data: {
        processoId: processoId,
        titulo: data.tipo,
        descricao: data.descricao,
        autorNome: user.nome || "Advogado",
        createdBy: userId,
      }
    });
  }
}