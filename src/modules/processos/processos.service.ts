import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { ProcessoEntity } from "./entities/processo.entity.js";
import type { CreateProcessoInput } from "./dto/create-processo.dto.js";

// 👇 IMPORTAÇÃO DO ZAPSIGN (ajuste o caminho se necessário)



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
          telefone: input.clienteTelefone,
          endereco: input.clienteEndereco ?? null
        },
        create: {
          nome: input.clienteNome,
          cpf: input.clienteCpf,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone ,
          endereco: input.clienteEndereco ?? null
        }
      });
      clienteIdConectado = cliente.id;
    } else {
      const cliente = await prisma.cliente.upsert({
        where: { telefone: input.clienteTelefone },
        update: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null,
          endereco: input.clienteEndereco ?? null
        },
        create: {
          nome: input.clienteNome,
          email: input.clienteEmail ?? null,
          telefone: input.clienteTelefone,
          cpf: null ,
          endereco: input.clienteEndereco ?? null
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


    // 5. Montagem do Payload do Prisma
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
      clienteCpf: entity.props.clienteCpf || null,
      clienteEmail: entity.props.clienteEmail || null,
      basePrevisao: entity.props.basePrevisao || null,
      dataEstimadaRecebimento: entity.props.dataEstimadaRecebimento || null,

      // 👇 CORREÇÃO AQUI: Usando `|| null` para garantir que campos vazios cheguem como null no banco
      numeroProcesso: entity.props.numeroProcesso?.trim() || null,
      numeroCNJ: entity.props.numeroProcesso?.trim() || null, 

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
      include: 
      { cliente: true ,
        conversation: true
      }
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

    // 1. SEPARAR OS DADOS
    const {
      clienteTelefone,
      clienteEndereco,
      clienteId,
      arquivos,  // 👈 O array de arquivos que vem do front
      ...dadosProcesso
    } = input;

    Object.keys(dadosProcesso).forEach((key) => {
      if (dadosProcesso[key] === undefined) delete dadosProcesso[key];
    });

    if (dadosProcesso.numeroProcesso !== undefined) {
      dadosProcesso.numeroProcesso = dadosProcesso.numeroProcesso?.trim() || null;
      dadosProcesso.numeroCNJ = dadosProcesso.numeroProcesso; 
    }

    // 2. ATUALIZAR O CLIENTE VINCULADO
    if (processo.clienteId) {
      const dadosParaOCliente: any = {};
      
      if (dadosProcesso.clienteNome !== undefined) dadosParaOCliente.nome = dadosProcesso.clienteNome;
      if (dadosProcesso.clienteCpf !== undefined) dadosParaOCliente.cpf = dadosProcesso.clienteCpf;
      if (dadosProcesso.clienteEmail !== undefined) dadosParaOCliente.email = dadosProcesso.clienteEmail;
      
      if (clienteTelefone !== undefined) dadosParaOCliente.telefone = clienteTelefone;
      if (clienteEndereco !== undefined) dadosParaOCliente.endereco = clienteEndereco;

      if (Object.keys(dadosParaOCliente).length > 0) {
        await prisma.cliente.update({
          where: { id: processo.clienteId },
          data: dadosParaOCliente
        });
      }
    }

    // 3. LÓGICA DE ATUALIZAÇÃO DOS ARQUIVOS E MUDANÇA DE WORKFLOW
    if (arquivos && Array.isArray(arquivos)) {
      dadosProcesso.arquivos = {
        deleteMany: {}, 
        create: arquivos.map((arq: any) => ({
          tipo: arq.tipo, // O front manda 'CONTRATO', 'PROCURACAO', 'DOCUMENTO', etc
          url: arq.url,
          nomeArquivo: arq.nomeArquivo
        }))
      };

      // 👇👇👇 A MÁGICA ACONTECE AQUI 👇👇👇

      // Verifica se na lista de arquivos que o front mandou agora, 
      // o advogado incluiu o Contrato e a Procuração
      const temContrato = arquivos.some(arq => arq.tipo === 'CONTRATO');
      const temProcuracao = arquivos.some(arq => arq.tipo === 'PROCURACAO'); // ou 'PETICAO', mude se quiser

      // Se ambos foram anexados E esse processo nasceu de uma conversa de WhatsApp
      if (temContrato && temProcuracao && processo.conversationId) {
        
        console.log(`✅ Contrato e Procuração anexados. Finalizando o Lead (Conversa ID: ${processo.conversationId})...`);

        // Atualizamos o Workflow da Conversa
        await prisma.conversation.update({
          where: { id: processo.conversationId },
          data: {
            workflowStep: "FINALIZADO", // 👈 Muda o workflow
            status: "CLOSED",           // 👈 Opcional: Fecha o chat para não ficar poluindo a caixa de entrada
          }
        });
      }
    }

    // 4. ATUALIZAR O PROCESSO E OS ARQUIVOS (Executa a query)
    return await prisma.processo.update({
      where: { id },
      data: dadosProcesso,
      include: { arquivos: true }
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

  // 👇 NOVO MÉTODO: EXCLUIR PROCESSO
  async delete(id: string, userId: string) {
    // 1. Verifica se o processo existe e pertence ao usuário/advogado logado
    const processo = await prisma.processo.findFirst({
      where: { id, userId }
    });

    if (!processo) {
      throw new Error("Processo não encontrado ou você não tem permissão para excluí-lo.");
    }

    // 2. Exclui primeiro as tabelas dependentes para evitar erros de Foreign Key 
    // (Caso não tenha onDelete: Cascade configurado no seu banco)
    await prisma.andamento.deleteMany({
      where: { processoId: id }
    });

    await prisma.processoArquivo.deleteMany({
      where: { processoId: id }
    });

    // 3. Exclui o processo principal
    return await prisma.processo.delete({
      where: { id }
    });
  }
}