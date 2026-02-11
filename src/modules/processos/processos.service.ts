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

    // 2. Entidade
    const entity = new ProcessoEntity(input);

    // 3. Gestão do Cliente (Upsert)
    let clienteIdConectado: string;

    if (entity.props.clienteCpf) {
      const cliente = await prisma.cliente.upsert({
        where: { cpf: entity.props.clienteCpf },
        update: {
          nome: entity.props.clienteNome,
          email: entity.props.clienteEmail ?? null, 
        },
        create: {
          nome: entity.props.clienteNome,
          cpf: entity.props.clienteCpf,
          email: entity.props.clienteEmail ?? null,
          telefone: `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`
        }
      });
      clienteIdConectado = cliente.id;
    } else {
      const cliente = await prisma.cliente.create({
        data: {
          nome: entity.props.clienteNome,
          email: entity.props.clienteEmail ?? null,
          telefone: `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`
        }
      });
      clienteIdConectado = cliente.id;
    }

    // 4. Montagem do Payload (CORREÇÃO DO exactOptionalPropertyTypes)
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
      // Aqui usamos ?? null porque o campo no banco aceita NULL
      clienteCpf: entity.props.clienteCpf ?? null,
      clienteEmail: entity.props.clienteEmail ?? null,
      numeroProcesso: entity.props.numeroProcesso ?? null,
      basePrevisao: entity.props.basePrevisao ?? null,
      dataEstimadaRecebimento: entity.props.dataEstimadaRecebimento ?? null,

      // --- CAMPOS COM DEFAULT (CORREÇÃO DA SUA DÚVIDA) ---
      // Se numeroInterno for nulo/undefined, NÃO colocamos a chave no objeto.
      // Se tiver valor, colocamos. Isso evita o erro de "undefined is not assignable to string".
      ...(entity.props.numeroInterno ? { numeroInterno: entity.props.numeroInterno } : {}),

      // --- CONEXÕES ---
      cliente: { connect: { id: clienteIdConectado } },
      user: { connect: { id: userId } }
    };

    return await prisma.processo.create({ data: prismaData });
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
      include: { cliente: true }
    });
  }

  async setArquivado(id: string, userId: string, status: boolean) {
    // Agora que adicionamos dataArquivamento no schema, isso vai funcionar
    return await prisma.processo.updateMany({
      where: { id, userId },
      data: { 
        arquivado: status, 
        dataArquivamento: status ? new Date() : null 
      }
    });
  }

  // ... (métodos update, listAndamentos e createAndamento seguem a mesma lógica)
  async update(id: string, userId: string, input: any) {
    const processo = await prisma.processo.findFirst({ where: { id, userId } });
    if (!processo) throw new Error("Processo não encontrado.");

    const dataToUpdate = { ...input };
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