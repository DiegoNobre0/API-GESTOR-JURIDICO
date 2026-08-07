import { generateObject } from 'ai';
import { z } from 'zod';
import { FinanceiroService } from '../../modules/financeiro/financeiro.service.js';
import { AgendaService } from '../../modules/agenda/agenda.service.js';
import { openai } from '@ai-sdk/openai';
import { prisma } from '../../lib/prisma.js';

// 🧠 CACHE EM MEMÓRIA: Guarda as ações pendentes de confirmação
const pendencias = new Map<string, any>();

export class AdvogadoAssistantService {
    private financeiroService = new FinanceiroService();
    private agendaService = new AgendaService();

    private async resolverProcessoNoBanco(termo?: string, userId?: string) {
        if (!termo || !userId) return null;

        const termoLimpoNum = termo.replace(/\D/g, '');
        const isNumeric = termoLimpoNum.length >= 6; // Pode ser CPF ou pedaço do CNJ

        return await prisma.processo.findFirst({
            where: {
                // 👇 Removi o 'userId: userId' para que ele ache processos do Leonardo ou de qualquer sócio do escritório
                arquivado: false,
                OR: [
                    // Se digitou número (CPF ou CNJ)
                    ...(isNumeric ? [
                        { numeroProcesso: { contains: termoLimpoNum } },
                        { numeroCNJ: { contains: termoLimpoNum } },
                        { clienteCpf: { contains: termoLimpoNum } },
                        { numeroInterno: { contains: termo } },
                        // Busca o CPF também na tabela relacional Cliente
                        { cliente: { cpf: { contains: termoLimpoNum } } }
                    ] : []),
                    // Busca por nome do cliente ou descrição no processo
                    { clienteNome: { contains: termo, mode: 'insensitive' } },
                    { descricaoObjeto: { contains: termo, mode: 'insensitive' } },
                    // 👇 O SEGREDO: Busca o nome também DENTRO da tabela do Cliente!
                    { cliente: { nome: { contains: termo, mode: 'insensitive' } } }
                ]
            },
            select: {
                id: true,
                clienteNome: true,
                numeroProcesso: true,
                numeroCNJ: true,
                // Traz os dados da tabela Cliente para garantirmos o nome correto
                cliente: {
                    select: { nome: true }
                }
            }
        });
    }

    // 👇 Usado para Compromissos (DateTime)
    private formatarDataIso(dataString?: string | null): string {
        if (!dataString) return new Date().toISOString();

        // Garante que é lido como string para evitar o erro do TS
        const str = String(dataString);
        const dataTratada = str.length === 10 ? `${str}T12:00:00.000Z` : str;

        const parsedDate = new Date(dataTratada);
        return !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();
    }

    // 👇 Usado para Tarefas e Transações (String)
    private extrairApenasData(dataString?: string | null): string {
        // substring(0, 10) garante que sempre retornará uma string segura sem arrays
        if (!dataString) return new Date().toISOString().substring(0, 10);

        return String(dataString).substring(0, 10);
    }
    async processarComando(mensagem: string, userId: string): Promise<string> {
        const textoLimpo = mensagem.trim().toLowerCase();

        // ==========================================================
        // 1. VERIFICA SE O ADVOGADO ESTÁ RESPONDENDO UMA CONFIRMAÇÃO
        // ==========================================================
        if (pendencias.has(userId)) {
            const comandoPendente = pendencias.get(userId);

            if (['sim', 'ok', 'confirmo', 'pode salvar', 'isso', 'yes', 'pode'].includes(textoLimpo)) {

                if (comandoPendente.acao === 'CRIAR_FINANCEIRO') {
                    // Transacao usa String para 'data' no Prisma
                    comandoPendente.financeiro.data = this.extrairApenasData(comandoPendente.financeiro.data);

                    await this.financeiroService.create(comandoPendente.financeiro as any, userId);
                    pendencias.delete(userId);
                    return `✅ *Lançamento Financeiro Salvo com sucesso!*`;
                }

                if (comandoPendente.acao === 'CRIAR_COMPROMISSO') {
                    // Compromisso usa DateTime para 'startDate' no Prisma
                    comandoPendente.compromisso.startDate = this.formatarDataIso(comandoPendente.compromisso.startDate);
                    if (comandoPendente.compromisso.endDate) {
                        comandoPendente.compromisso.endDate = this.formatarDataIso(comandoPendente.compromisso.endDate);
                    }

                    await this.agendaService.createCompromisso(comandoPendente.compromisso as any, userId);
                    pendencias.delete(userId);
                    return `📅 *Compromisso Agendado com sucesso!*`;
                }

                if (comandoPendente.acao === 'CRIAR_TAREFA') {
                    // Tarefa usa String para 'prazo' no Prisma
                    comandoPendente.tarefa.prazo = this.extrairApenasData(comandoPendente.tarefa.prazo);

                    await this.agendaService.addTarefa(comandoPendente.tarefa as any, userId);
                    pendencias.delete(userId);
                    return `📋 *Tarefa Anotada com sucesso!*`;
                }
            }
            else if (['nao', 'não', 'cancelar', 'cancela', 'errado'].includes(textoLimpo)) {
                pendencias.delete(userId);
                return "🚫 *Ação cancelada.* O que mais posso fazer por você?";
            }
            else {
                return "⚠️ *Você tem uma ação pendente.* Por favor, responda *SIM* para confirmar ou *NÃO* para cancelar.";
            }
        }

        // ==========================================================
        // 2. EXTRAÇÃO COM A IA
        // ==========================================================
        const agora = new Date();
        const dataHojeIso = agora.toISOString().split('T')[0];

        try {
            const categoriasPermitidas = [
                'Honorários Iniciais', 'Honorários Êxito', 'Honorários Mensais', 'Consultoria', 'Outros Recebimentos',
                'Custos Processuais', 'Despesas Administrativas', 'Aluguel', 'Salários', 'Marketing', 'Impostos'
            ] as const;

            const { object } = await generateObject({
                model: openai('gpt-4o-mini'),
                temperature: 0,
                schema: z.object({
                    acao: z.enum(['CRIAR_FINANCEIRO', 'CRIAR_COMPROMISSO', 'CRIAR_TAREFA', 'BATER_PAPO']),

                    financeiro: z.object({
                        tipo: z.enum(['entrada', 'saida']),
                        categoria: z.enum(categoriasPermitidas),
                        valor: z.number(),
                        data: z.string().describe("FORMATO: AAAA-MM-DD"),
                        descricao: z.string(),
                        recorrente: z.boolean().nullable(),
                    }).nullable(),

                    compromisso: z.object({
                        titulo: z.string(),
                        startDate: z.string().describe("FORMATO: AAAA-MM-DDTHH:mm:ss"),
                        endDate: z.string().nullable(),
                        description: z.string().nullable(),
                        tipo: z.enum(['reuniao', 'audiencia', 'prazo', 'outro']).nullable(),
                        location: z.string().nullable(),
                        termoBuscaProcesso: z.string().nullable().describe(
                            "Nome do cliente, CPF ou número do processo mencionado pelo advogado para vincular o compromisso"
                        )
                    }).nullable(),

                    tarefa: z.object({
                        titulo: z.string(),
                        description: z.string(),
                        responsavel: z.string(),
                        prazo: z.string().describe("FORMATO: AAAA-MM-DD")
                    }).nullable(),

                    respostaChat: z.string()
                }),
                prompt: `
    Você é o assistente virtual pessoal do advogado dono do sistema RCS Gestão Jurídica.
    O advogado enviou: "${mensagem}"
    
    Identifique a intenção:
    - Se for despesa/receita, 'CRIAR_FINANCEIRO'.
    - Se for marcar reunião/audiência, 'CRIAR_COMPROMISSO'.
    - Se for um lembrete, 'CRIAR_TAREFA'.
    - Se não for nada disso, 'BATER_PAPO'.

    REGRAS PARA O FINANCEIRO:
    - Se ENTRADA: 'Honorários Iniciais', 'Honorários Êxito', 'Honorários Mensais', 'Consultoria', 'Outros Recebimentos'.
    - Se SAIDA: 'Custos Processuais', 'Despesas Administrativas', 'Aluguel', 'Salários', 'Marketing', 'Impostos'.
    
    REGRAS PARA AGENDA (COMPROMISSO):
    - Se o advogado mencionar o nome de um cliente (ex: "audiência com o João"), CPF ou número do processo, coloque EXATAMENTE esse termo no campo 'termoBuscaProcesso'. 
    - Extraia apenas o nome/número limpo (ex: "João Silva" ou "1234567-89").

    A data de HOJE é ${dataHojeIso}. Calcule "amanhã", "semana que vem" com base nisso.
`,
            });

            // ==========================================================
            // 3. RETORNA O PEDIDO DE CONFIRMAÇÃO
            // ==========================================================

            if (object.acao === 'CRIAR_FINANCEIRO' && object.financeiro) {
                pendencias.set(userId, object);
                const tipoStr = object.financeiro.tipo === 'entrada' ? '🟢 Receita' : '🔴 Despesa';
                const dataFormatada = this.extrairApenasData(object.financeiro.data).split('-').reverse().join('/');

                return `⏳ *Confirmação de Lançamento:*\n\n${tipoStr}: ${object.financeiro.descricao}\nCategoria: ${object.financeiro.categoria}\nValor: R$ ${object.financeiro.valor}\nData: ${dataFormatada}\n\n👉 Responda *SIM* para salvar ou *NÃO* para cancelar.`;
            }

            if (object.acao === 'CRIAR_COMPROMISSO' && object.compromisso) {
                // 👇 CORREÇÃO 1: Usa "|| undefined" para converter o null e agradar o TypeScript
                const processoEncontrado = await this.resolverProcessoNoBanco(
                    object.compromisso.termoBuscaProcesso || undefined,
                    userId
                );

                // Garante que o tipo tenha um padrão seguro para salvar no banco
                const tipoSeguro = object.compromisso.tipo || 'reuniao';

                // Injeta o ID encontrado no objeto que vai para o Map de pendências
                const compromissoParaSalvar = {
                    ...object.compromisso,
                    processoId: processoEncontrado?.id || null,
                    tipo: tipoSeguro
                };

                pendencias.set(userId, {
                    ...object,
                    compromisso: compromissoParaSalvar
                });

                const dataObj = new Date(this.formatarDataIso(object.compromisso.startDate));
                const dataFormatada = `${dataObj.toLocaleDateString('pt-BR')} às ${dataObj.getHours()}h${dataObj.getMinutes() === 0 ? '00' : dataObj.getMinutes()}`;

                // 👇 CORREÇÃO 2: Usa a variável tipoSeguro em vez de object.compromisso.tipo
                let iconeTipo = '📅';
                if (tipoSeguro === 'audiencia') iconeTipo = '⚖️';
                if (tipoSeguro === 'prazo') iconeTipo = '⏳';

                let msg = `⏳ *Confirmação de Agenda (${iconeTipo} ${tipoSeguro.toUpperCase()}):*\n\n`;
                msg += `*Título:* ${object.compromisso.titulo}\n`;
                msg += `*Data/Hora:* ${dataFormatada}\n`;

                if (processoEncontrado) {
                    const procNum = processoEncontrado.numeroProcesso || processoEncontrado.numeroCNJ || 'Sem número';
                    
                    // 👇 Pega o nome do "cache" do processo, ou vai buscar na tabela Cliente oficial
                    const nomeClienteFinal = processoEncontrado.clienteNome || processoEncontrado.cliente?.nome || 'Cliente';
                    
                    msg += `*Vinculado a:* ${nomeClienteFinal} (${procNum})\n`;
                } else if (object.compromisso.termoBuscaProcesso) {
                    msg += `⚠️ _Não encontrei processo para "${object.compromisso.termoBuscaProcesso}". Será agendado sem vínculo._\n`;
                }

                msg += `\n👉 Responda *SIM* para agendar ou *NÃO* para cancelar.`;

                return msg;
            }

            if (object.acao === 'CRIAR_TAREFA' && object.tarefa) {
                pendencias.set(userId, object);
                const dataFormatada = this.extrairApenasData(object.tarefa.prazo).split('-').reverse().join('/');

                return `⏳ *Confirmação de Tarefa:*\n\nTarefa: ${object.tarefa.titulo}\nPrazo: ${dataFormatada}\nResponsável: ${object.tarefa.responsavel}\n\n👉 Responda *SIM* para anotar ou *NÃO* para cancelar.`;
            }

            return object.respostaChat;

        } catch (error) {
            console.error("Erro na extração de dados com IA:", error);
            return "Desculpe, doutor. Tive um problema ao processar. Tente ser mais específico na data ou valor.";
        }
    }
}