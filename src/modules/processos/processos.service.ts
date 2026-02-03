import { prisma } from "@/lib/prisma.js";
import { Prisma } from "@prisma/client"; // Importação essencial para os tipos
import { ProcessoEntity } from "./entities/processo.entity.js";
import type { CreateProcessoInput } from "./dto/create-processo.dto.js";

export class ProcessosService {
  
  async create(input: CreateProcessoInput, userId: string) {
    // 1. Regra de Negócio: Evitar duplicidade de número de processo
    if (input.numeroProcesso) {
      const existe = await prisma.processo.findFirst({ 
        where: { numeroProcesso: input.numeroProcesso } 
      });
      if (existe) throw new Error("Já existe um processo com este número.");
    }

    // 2. Validação de domínio através da Entidade
    const entity = new ProcessoEntity(input);

    // 3. Mapeamento manual para satisfazer o 'exactOptionalPropertyTypes'
    // Transformamos undefined em null conforme exigido pelo Prisma no MongoDB
    const prismaData: Prisma.ProcessoCreateInput = {
      clienteNome: entity.props.clienteNome,
      descricaoObjeto: entity.props.descricaoObjeto,
      dataFechamentoContrato: entity.props.dataFechamentoContrato,
      responsavel: entity.props.responsavel,
      tipoHonorarios: entity.props.tipoHonorarios,
      valorPrevistoIniciais: entity.props.valorPrevistoIniciais,
      valorPrevistoExito: entity.props.valorPrevistoExito,
      custosPrevistos: entity.props.custosPrevistos,
      statusProtocolamento: entity.props.statusProtocolamento,
      statusGeral: entity.props.statusGeral,
      
      // Tratamento de campos opcionais
      numeroInterno: entity.props.numeroInterno ?? null,
      numeroProcesso: entity.props.numeroProcesso ?? null,
      basePrevisao: entity.props.basePrevisao ?? null,
      dataEstimadaRecebimento: entity.props.dataEstimadaRecebimento ?? null,
      clienteCpf: entity.props.clienteCpf ?? null,
      clienteEmail: entity.props.clienteEmail ?? null,

      // Vinculação relacional com o Dr. logado
      user: { connect: { id: userId } }
    };

    return await prisma.processo.create({ data: prismaData });
  }

  // Busca processos ativos ou arquivados
  async list(userId: string, arquivado = false) {
    return await prisma.processo.findMany({
      where: { userId, arquivado },
      orderBy: { createdAt: 'desc' }
    });
  }

  // Busca detalhada por ID
  async findById(id: string, userId: string) {
    return await prisma.processo.findFirst({ 
      where: { id, userId } 
    });
  }

  // Gerencia o status de arquivamento
  async setArquivado(id: string, userId: string, status: boolean) {
    return await prisma.processo.updateMany({
      where: { id, userId },
      data: { 
        arquivado: status, 
        dataArquivamento: status ? new Date() : null 
      }
    });
  }
}