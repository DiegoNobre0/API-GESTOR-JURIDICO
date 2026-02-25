import { generateObject } from 'ai';
import { z } from 'zod';
import { FinanceiroService } from '../../modules/financeiro/financeiro.service.js';
import { AgendaService } from '../../modules/agenda/agenda.service.js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// 🧠 CACHE EM MEMÓRIA: Guarda as ações pendentes de confirmação
const pendencias = new Map<string, any>();

export class AdvogadoAssistantService {
    private financeiroService = new FinanceiroService();
    private agendaService = new AgendaService();

    private google = createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY || '',
    });

    // 👇 CORREÇÃO DO FUSO HORÁRIO: Forçamos o meio-dia (T12:00:00Z) para não voltar de dia no Brasil
    private formatarDataSegura(dataString?: string): string {
        if (!dataString) return new Date().toISOString();

        let dataTratada = dataString;
        if (dataString.length === 10) { // Se for apenas AAAA-MM-DD
            dataTratada = `${dataString}T12:00:00.000Z`;
        }

        const parsedDate = new Date(dataTratada);
        if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
        }
        return new Date().toISOString();
    }

    async processarComando(mensagem: string, userId: string): Promise<string> {
        const textoLimpo = mensagem.trim().toLowerCase();

        // ==========================================================
        // 1. VERIFICA SE O ADVOGADO ESTÁ RESPONDENDO UMA CONFIRMAÇÃO
        // ==========================================================
        if (pendencias.has(userId)) {
            const comandoPendente = pendencias.get(userId);

            // Se for SIM, salvamos!
            if (['sim', 'ok', 'confirmo', 'pode salvar', 'isso', 'yes'].includes(textoLimpo)) {

                if (comandoPendente.acao === 'CRIAR_FINANCEIRO') {
                    comandoPendente.financeiro.data = this.formatarDataSegura(comandoPendente.financeiro.data);
                    await this.financeiroService.create(comandoPendente.financeiro as any, userId);
                    pendencias.delete(userId);
                    return `✅ *Lançamento Financeiro Salvo com sucesso!*`;
                }

                if (comandoPendente.acao === 'CRIAR_COMPROMISSO') {
                    comandoPendente.compromisso.startDate = this.formatarDataSegura(comandoPendente.compromisso.startDate);
                    await this.agendaService.createCompromisso(comandoPendente.compromisso, userId);
                    pendencias.delete(userId);
                    return `📅 *Compromisso Agendado com sucesso!*`;
                }

                if (comandoPendente.acao === 'CRIAR_TAREFA') {
                    if (comandoPendente.tarefa.dueDate) {
                        comandoPendente.tarefa.dueDate = this.formatarDataSegura(comandoPendente.tarefa.dueDate);
                    }
                    await this.agendaService.addTarefa(comandoPendente.tarefa, userId);
                    pendencias.delete(userId);
                    return `📋 *Tarefa Anotada com sucesso!*`;
                }
            }
            // Se for NÃO, cancelamos
            else if (['nao', 'não', 'cancelar', 'cancela', 'errado'].includes(textoLimpo)) {
                pendencias.delete(userId);
                return "🚫 *Ação cancelada.* O que mais posso fazer por você?";
            }
            // Outra resposta
            else {
                return "⚠️ *Você tem uma ação pendente.* Por favor, responda *SIM* para confirmar ou *NÃO* para cancelar.";
            }
        }

        // ==========================================================
        // 2. EXTRAÇÃO COM A IA (Gemini 2.5 Flash)
        // ==========================================================
        const agora = new Date();
        const dataHojeIso = agora.toISOString().split('T')[0]; // Ex: "2026-02-23"

        try {
            // Unimos todas as categorias válidas do front-end
            const categoriasPermitidas = [
                'Honorários Iniciais', 'Honorários Êxito', 'Honorários Mensais', 'Consultoria', 'Outros Recebimentos',
                'Custos Processuais', 'Despesas Administrativas', 'Aluguel', 'Salários', 'Marketing', 'Impostos'
            ] as const;

            const { object } = await generateObject({
                model: this.google('gemini-2.5-flash'),
                temperature: 0,
                schema: z.object({
                    acao: z.enum(['CRIAR_FINANCEIRO', 'CRIAR_COMPROMISSO', 'CRIAR_TAREFA', 'BATER_PAPO']),

                    financeiro: z.object({
                        tipo: z.enum(['entrada', 'saida']),
                        // 👇 Forçamos a IA a escolher estritamente uma dessas strings
                        categoria: z.enum(categoriasPermitidas),
                        valor: z.number(),
                        data: z.string().describe("FORMATO: AAAA-MM-DD"),
                        descricao: z.string().describe("A descrição real do que foi o gasto/receita. Ex: 'Uber para o fórum', 'Conta de Luz'"),
                        recorrente: z.boolean().default(false),
                    }).optional(),

                    compromisso: z.object({
                        titulo: z.string(),
                        startDate: z.string().describe("FORMATO: AAAA-MM-DDTHH:mm:ss"),
                        endDate: z.string().optional(),
                        description: z.string().optional(),
                    }).optional(),

                    tarefa: z.object({
                        titulo: z.string(),
                        // 👇 Adicionando os campos obrigatórios do seu banco
                        description: z.string().describe("Breve descrição do que deve ser feito"),
                        responsavel: z.string().describe("Nome de quem vai fazer (geralmente 'Eu' ou o nome do advogado)"),
                        prazo: z.string().describe("FORMATO: AAAA-MM-DD")
                    }).optional(),

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

                    REGRAS PARA O FINANCEIRO (MUITO IMPORTANTE):
                    A descrição é o nome do gasto em si (ex: 'Almoço com cliente', 'Uber').
                    Mas a "categoria" DEVE ser escolhida estritamente com base nestas regras:
                    - Se TIPO for ENTRADA: escolha entre 'Honorários Iniciais', 'Honorários Êxito', 'Honorários Mensais', 'Consultoria', 'Outros Recebimentos'.
                    - Se TIPO for SAIDA: escolha entre 'Custos Processuais', 'Despesas Administrativas', 'Aluguel', 'Salários', 'Marketing', 'Impostos'.
                    (Dica: Contas de luz, internet, Uber e alimentação caem em 'Despesas Administrativas').
                    
                    INFORMAÇÃO IMPORTANTE DE DATA:
                    A data de HOJE é ${dataHojeIso}.
                    Use essa data como base para os cálculos.
                `,
            });

            // ==========================================================
            // 3. RETORNA O PEDIDO DE CONFIRMAÇÃO (GUARDA NA MEMÓRIA)
            // ==========================================================

            if (object.acao === 'CRIAR_FINANCEIRO' && object.financeiro) {
                pendencias.set(userId, object);
                const tipoStr = object.financeiro.tipo === 'entrada' ? '🟢 Receita' : '🔴 Despesa';
                // Usamos a função segura só pra mostrar na tela corretamente
                const dataFormatada = new Date(this.formatarDataSegura(object.financeiro.data)).toLocaleDateString('pt-BR');

                return `⏳ *Confirmação de Lançamento:*\n\n${tipoStr}: ${object.financeiro.descricao}\nValor: R$ ${object.financeiro.valor}\nData: ${dataFormatada}\n\n👉 Responda *SIM* para salvar ou *NÃO* para cancelar.`;
            }

            if (object.acao === 'CRIAR_COMPROMISSO' && object.compromisso) {
                pendencias.set(userId, object);
                const dataFormatada = new Date(this.formatarDataSegura(object.compromisso.startDate)).toLocaleString('pt-BR');

                return `⏳ *Confirmação de Agenda:*\n\nTítulo: ${object.compromisso.titulo}\nInício: ${dataFormatada}\n\n👉 Responda *SIM* para agendar ou *NÃO* para cancelar.`;
            }

            if (object.acao === 'CRIAR_TAREFA' && object.tarefa) {
                pendencias.set(userId, object);

                let msg = `⏳ *Confirmação de Tarefa:*\n\nTarefa: ${object.tarefa.titulo}`;
                if (object.tarefa.prazo) {
                    // Usamos .prazo em vez de .dueDate
                    msg += `\nPrazo: ${new Date(this.formatarDataSegura(object.tarefa.prazo)).toLocaleDateString('pt-BR')}`;
                }
                msg += `\nResponsável: ${object.tarefa.responsavel}`;
                msg += `\n\n👉 Responda *SIM* para anotar ou *NÃO* para cancelar.`;

                return msg;
            }

            return object.respostaChat;

        } catch (error) {
            console.error("Erro na extração de dados com IA:", error);
            return "Desculpe, doutor. Tive um problema ao processar. Tente ser mais específico na data ou valor.";
        }
    }
}