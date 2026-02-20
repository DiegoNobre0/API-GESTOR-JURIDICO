import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { ProcessoEntity } from "./entities/processo.entity.js";
import type { CreateProcessoInput } from "./dto/create-processo.dto.js";
import { ZapSignService } from "@/infra/services/zapsign-service.js";
// 👇 IMPORTAÇÃO DO ZAPSIGN (ajuste o caminho se necessário)


const zapSignService = new ZapSignService();

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

    if (input.clienteCpf) {
      const cliente = await prisma.cliente.upsert({
        where: { cpf: input.clienteCpf },
        update: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone
        },
        create: {
          nome: input.clienteNome,
          cpf: input.clienteCpf,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone 
        }
      });
      clienteIdConectado = cliente.id;
    } else {
      const cliente = await prisma.cliente.upsert({
        where: { telefone: input.clienteTelefone },
        update: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null,
        },
        create: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone,
          cpf: null 
        }
      });
      clienteIdConectado = cliente.id;
    }

    // 👇 4. INTEGRAÇÃO ZAPSIGN (Geração Automática de Contratos)
    // Preparamos a lista de arquivos que vieram do frontend
    const arquivosParaSalvar = input.arquivos?.map(arq => ({
      tipo: arq.tipo,
      url: arq.url,
      nomeArquivo: arq.nomeArquivo
    })) || [];

    // Se o frontend pediu para gerar os documentos (clicou no botão)
    if (input.gerarDocumentosZapSign) {
      const dadosParaDocumento = {
        nome: input.clienteNome,
        cpf: input.clienteCpf,
        telefone: input.clienteTelefone,
        endereco: "Endereço pendente" // Opcional: Pegar do formulário depois se quiser
      };

      // Gera Contrato
      const contrato = await zapSignService.gerarDocumento(
        dadosParaDocumento,
        "65194d71-ad5d-4192-a2b2-5838f664a6dc", // ID do Modelo do Contrato
        `Contrato - ${input.clienteNome}`
      );
      if (contrato) arquivosParaSalvar.push({
          tipo: "CONTRATO",
          nomeArquivo: contrato.nomeArquivo,
          url: contrato.url
      });

      // Gera Procuração
      const procuracao = await zapSignService.gerarDocumento(
        dadosParaDocumento,
        "52151f47-c845-45a7-beae-6cd1042d5ecb", // ID do Modelo da Procuração
        `Procuração - ${input.clienteNome}`
      );
      if (procuracao) arquivosParaSalvar.push({
          tipo: "PROCURAÇÃO",
          nomeArquivo: procuracao.nomeArquivo,
          url: procuracao.url
      });
    }

    // 5. Montagem do Payload do Prisma
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

      // 👇 VINCULAÇÃO COM O CHAT DO WHATSAPP AQUI
      ...(input.conversationId ? { conversation: { connect: { id: input.conversationId } } } : {}),

      ...(entity.props.numeroInterno ? { numeroInterno: entity.props.numeroInterno } : {}),

      // --- CONEXÕES ---
      cliente: { connect: { id: clienteIdConectado } },
      user: { connect: { id: userId } },

      // --- ARQUIVOS ---
      // Salva os arquivos (Uploads normais + Links do ZapSign)
      arquivos: {
        create: arquivosParaSalvar
      }
    };

    return await prisma.processo.create({
      data: prismaData,
      include: { arquivos: true }
    });
  }

  // -----------------------------------------------------------------------
  // OUTROS MÉTODOS (Mantidos intactos)
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
        arquivos: true,
        conversation: {
          select: { id: true }
        }
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