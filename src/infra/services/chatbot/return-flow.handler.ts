
import { prisma } from '@/lib/prisma.js';
import { getSaudacaoAtual } from './utils.js';

export class ReturnFlowHandler {
  async handle(texto: string, conversation: any): Promise<string | null> {
    const nome = conversation.customerName ?? 'tudo bem';

    // ETAPA 1 – Primeira mensagem após FINALIZADO (sem returnFlow ainda)
    if (!conversation.returnFlow) {
      await prisma.conversation.update({
        where: { customerPhone: conversation.customerPhone },
        data: { returnFlow: 'AGUARDANDO_ESCOLHA' },
      });

      return `${getSaudacaoAtual()}, ${nome} 😊

Seu atendimento anterior já foi finalizado.

Como posso te ajudar agora?

Você quer acompanhar um processo ou iniciar um novo atendimento?`;
    }

    // ETAPA 2 – Detecta intenção do cliente
    if (conversation.returnFlow === 'AGUARDANDO_ESCOLHA') {
      return this.handleEscolha(texto, conversation);
    }

    // ETAPA 3 – Recebe CPF/CNPJ para consulta
    if (conversation.returnFlow === 'AGUARDANDO_CPF') {
      return this.handleCPF(texto, conversation);
    }

    // ETAPA 4 – Cliente escolhe entre múltiplos processos
    if (conversation.returnFlow === 'ESCOLHENDO_PROCESSO') {
      return this.handleEscolhaProcesso(texto, conversation);
    }

    return null;
  }

  private async handleEscolha(texto: string, conversation: any): Promise<string> {
    const t = texto.toLowerCase();

    if (t.includes('processo')) {
      await prisma.conversation.update({
        where: { customerPhone: conversation.customerPhone },
        data: { returnFlow: 'AGUARDANDO_CPF' },
      });
      return `Perfeito 👍  \nPara localizar seus processos, me informe seu CPF.`;
    }

    if (t.includes('novo') || t.includes('atendimento') || t.includes('abrir')) {
      await prisma.conversation.update({
        where: { customerPhone: conversation.customerPhone },
        data: { workflowStep: 'COLETA_FATOS', returnFlow: null, returnData: {} },
      });
      return `Claro 😊  \nVamos iniciar um novo atendimento.\n\nPode me contar o que aconteceu?`;
    }

    return `Você gostaria de acompanhar um processo ou iniciar um novo atendimento?`;
  }

  private async handleCPF(texto: string, conversation: any): Promise<string> {
    const documentoLimpo = texto.replace(/\D/g, '');

    if (documentoLimpo.length !== 11 && documentoLimpo.length !== 14) {
      return 'Por favor, me informe um CPF (11 números) ou CNPJ (14 números) válido.';
    }

    const documentoFormatado =
      documentoLimpo.length === 11
        ? documentoLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
        : documentoLimpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

    const processos = await prisma.processo.findMany({
      where: {
        OR: [{ clienteCpf: documentoFormatado }, { clienteCpf: documentoLimpo }],
        userId: conversation.userId,
        arquivado: false,
      },
      include: { andamentos: { orderBy: { createdAt: 'desc' }, take: 3 } },
    });

    if (!processos.length) {
      return 'Não encontrei processos vinculados a esse documento.';
    }

    if (processos.length === 1) {
      await prisma.conversation.update({
        where: { customerPhone: conversation.customerPhone },
        data: { returnFlow: null, returnData: {} },
      });
      return this.formatarAndamentos(processos);
    }

    await prisma.conversation.update({
      where: { customerPhone: conversation.customerPhone },
      data: {
        returnFlow: 'ESCOLHENDO_PROCESSO',
        returnData: {
          processos: processos.map(p => ({
            id: p.id,
            numero: p.numeroProcesso ?? p.numeroInterno,
          })),
        },
      },
    });

    return this.montarListaProcessos(processos);
  }

  private async handleEscolhaProcesso(texto: string, conversation: any): Promise<string> {
    const escolha = parseInt(texto.replace(/\D/g, ''));
    const lista = conversation.returnData?.processos;

    if (!lista || !escolha || escolha < 1 || escolha > lista.length) {
      return 'Pode me dizer qual processo deseja ver? (ex: 1)';
    }

    const escolhido = lista[escolha - 1];

    const processo = await prisma.processo.findFirst({
      where: { id: escolhido.id, userId: conversation.userId },
      include: { andamentos: { orderBy: { dataMovimento: 'desc' }, take: 5 } },
    });

    if (!processo) {
      return 'Ops, não encontrei os detalhes desse processo. Tente consultar novamente.';
    }

    await prisma.conversation.update({
      where: { customerPhone: conversation.customerPhone },
      data: { returnFlow: null, returnData: {} },
    });

    return this.formatarAndamentosProcesso(processo);
  }

  private montarListaProcessos(processos: any[]): string {
    let msg = `Encontrei mais de um processo seu 😊\n\nQual deles você deseja acompanhar?\n\n`;
    processos.forEach((p, i) => {
      msg += `${i + 1}️⃣ Processo ${p.numeroProcesso ?? p.numeroInterno}\n`;
    });
    msg += `\nPode me dizer o número.`;
    return msg;
  }

  private formatarAndamentos(processos: any[]): string {
    let resposta = `Encontrei atualizações do seu processo 👇\n\n`;
    processos.forEach(p => {
      resposta += `📁 ${p.descricaoObjeto}\n`;
      if (!p.andamentos.length) {
        resposta += `Sem movimentações recentes.\n\n`;
        return;
      }
      p.andamentos.forEach((a: any) => {
        resposta += `• ${a.titulo}\n${a.descricao}\n\n`;
      });
    });
    return resposta.trim();
  }

  private formatarAndamentosProcesso(processo: any): string {
    const numProcesso = processo.numeroProcesso ?? processo.numeroInterno;
    let msg = `📄 *Processo:* ${numProcesso}\n\n`;

    if (!processo.andamentos || processo.andamentos.length === 0) {
      msg += `Ainda não temos movimentações registradas para este processo.\n`;
      msg += `Fique tranquilo, assim que houver novidades, nós avisaremos!`;
      return msg;
    }

    msg += `*Últimas movimentações:*\n\n`;
    processo.andamentos.forEach((and: any) => {
      const dataRaw = and.dataMovimento || and.createdAt;
      const dataFormatada = new Intl.DateTimeFormat('pt-BR').format(new Date(dataRaw));

      msg += `📅 *${dataFormatada}*\n`;
      msg += `🔹 *${and.titulo}*\n`;

      if (and.descricao && and.descricao !== and.titulo) {
        msg += `_${and.descricao}_\n`;
      }
      msg += `\n`;
    });

    return msg;
  }
}
