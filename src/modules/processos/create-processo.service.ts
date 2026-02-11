import { prisma } from '@/lib/prisma.js';

export class CreateProcessoFromConversationService {
  
  async execute(conversationId: string, userId: string) {
    // 1. Busca a conversa com documentos e dados
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        documents: true
      }
    });

    if (!conversation) throw new Error('Conversa não encontrada.');

    // 2. Extrai dados do JSON temporário (tempData)
    const dados = conversation.tempData as any || {};

    // --- Lógica Inteligente de Extração de Dados ---
    // Tenta pegar do OCR primeiro (mais confiável), senão pega do cadastro do bot
    const nomeFinal = 
      this.clean(dados.extracted_RG_nome) || 
      this.clean(dados.extracted_CNH_nome) || 
      conversation.customerName || 
      "Cliente sem Nome";

    const cpfFinal = 
      this.clean(dados.extracted_RG_cpf) || 
      this.clean(dados.extracted_CNH_cpf) || 
      this.clean(dados.extracted_CPF_numero);

    const enderecoFinal = 
      this.clean(dados.extracted_COMP_RES_endereco) || 
      this.clean(dados.extracted_RG_endereco);


    // 3. Upsert do Cliente (Cria ou Atualiza)
    // Usa o CPF como chave forte, ou o telefone como fallback
    let cliente;

    if (cpfFinal) {
      cliente = await prisma.cliente.upsert({
        where: { cpf: cpfFinal },
        update: {
          nome: nomeFinal,
          telefone: conversation.customerPhone,
          endereco: enderecoFinal,
        },
        create: {
          nome: nomeFinal,
          cpf: cpfFinal,
          telefone: conversation.customerPhone,
          endereco: enderecoFinal,
        }
      });
    } else {
      cliente = await prisma.cliente.upsert({
        where: { telefone: conversation.customerPhone },
        update: { nome: nomeFinal, endereco: enderecoFinal },
        create: {
          nome: nomeFinal,
          telefone: conversation.customerPhone,
          endereco: enderecoFinal,
        }
      });
    }

    // 4. Criação do Processo
    // Mapeia o "relato" do bot para "descricaoObjeto"
    const descricao = `[ORIGEM: WHATSAPP]
    Réu: ${dados.empresa || 'Não informado'}
    Data: ${dados.data_do_ocorrido || 'Não informada'}
    Relato: ${dados.dinamica_do_dano || 'Sem relato'}
    Prejuízo: ${dados.prejuizo || 'Sem prejuízo relatado'}`;

    const novoProcesso = await prisma.processo.create({
      data: {
        // Vínculos
        clienteId: cliente.id,
        userId: userId, // Advogado responsável (quem clicou no botão ou o bot)

        // Dados Cache (para compatibilidade com seu front atual)
        clienteNome: cliente.nome,
        clienteCpf: cliente.cpf,
        clienteEmail: cliente.email,

        // Dados Jurídicos
        descricaoObjeto: descricao,
        numeroProcesso: null, // Ainda não ajuizado
        responsavel: "A Definir", // Ou pegar do userId
        tipoHonorarios: "A Definir",
        statusGeral: "Triagem Bot",
        
        // Datas
        dataFechamentoContrato: new Date(),
      }
    });

    // 5. Migração de Documentos (R2 -> Pasta do Processo)
    const docsValidos = conversation.documents.filter(d => d.mediaUrl);

    if (docsValidos.length > 0) {
      await prisma.processoArquivo.createMany({
        data: docsValidos.map(doc => ({
          processoId: novoProcesso.id,
          tipo: doc.tipo,          // RG, COMP_RES, PROVAS...
          url: doc.mediaUrl!,
          nomeArquivo: doc.fileName || `doc_${Date.now()}`
        }))
      });
    }

    // 6. Atualiza a Conversa para finalizar
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        workflowStep: 'FINALIZADO',
        tags: { push: 'PROCESSADO' }
      }
    });

    return novoProcesso;
  }

  // Helper para limpar "null", "undefined" ou strings vazias
  private clean(val: any): string | null {
    if (!val) return null;
    const str = String(val).trim();
    if (str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str === '') return null;
    return str;
  }
}