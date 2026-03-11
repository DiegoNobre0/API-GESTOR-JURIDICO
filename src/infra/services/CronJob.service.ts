import cron from 'node-cron';
import { generateText } from 'ai';
import { prisma } from '../../lib/prisma.js';
import { DatajudService } from './datajud.service.js';
import { MailService } from './mail-service.js';
import { openai } from '@ai-sdk/openai';

export class CronJobService {
  private datajud = new DatajudService();
  private mail = new MailService();

  constructor() {
    console.log('📌 [SISTEMA] CronJob carregado: Título Real + Explicação IA.');
  }

  iniciarAgendamento() {
    cron.schedule('0 4 * * *', async () => {
      await this.executarMonitoramento();
    });
  }

  async executarMonitoramento() {
    console.log('⏳ [SISTEMA] Iniciando monitoramento híbrido...');

    try {
      const usuarios = await prisma.user.findMany({
        where: { ativo: true, notificarPje: true },
        include: {
          processos: { where: { arquivado: false, numeroProcesso: { not: null } } }
        }
      });

      for (const usuario of usuarios) {
        if (!usuario.email || usuario.processos.length === 0) continue;

        let resumoEmail = '';
        let houveNovidade = false;

        for (const processo of usuario.processos) {
          try {
            if (!processo.numeroProcesso) continue;

            const dados = await this.datajud.consultarMovimentacoes(processo.numeroProcesso);
            if (!dados?.movimentos?.length) continue;

            const movimentos = [...dados.movimentos].sort(
              (a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()
            );

            const ultimoMovimento = movimentos[0];
            if (!ultimoMovimento) continue;

            const dataUltimoMov = new Date(ultimoMovimento.dataHora);

            const jaExiste = await prisma.andamento.findFirst({
              where: {
                processoId: processo.id,
                codigoMovimento: ultimoMovimento.codigo,
                dataMovimento: dataUltimoMov
              }
            });

            if (jaExiste) continue;

            console.log(`🤖 Processando: ${ultimoMovimento.nome}`);

            // --- PROMPT BLINDADO PARA EVITAR ALUCINAÇÕES ---
            let explicacaoIA = "";
            try {
              const { text } = await generateText({
                model: openai('gpt-4o-mini'),
                temperature: 0.1, // Temperatura baixa = menos criatividade/alucinação
                system: `Você é um tradutor de termos jurídicos. 
                Sua única função é explicar o significado técnico do termo fornecido.
                REGRAS:
                1. Não tente prever o resultado do processo.
                2. Não invente fatos que não estão no título.
                3. Se o termo for genérico, diga apenas: "O processo teve uma nova movimentação técnica que aguarda análise".
                4. Máximo 150 caracteres.`,
                prompt: `Explique o termo jurídico: "${ultimoMovimento.nome}"`
              });
              explicacaoIA = text.trim();
            } catch {
              explicacaoIA = "O processo seguiu para uma nova fase interna.";
            }

            // 💾 Salva no Banco: Título Real + Explicação IA
            await prisma.andamento.create({
              data: {
                processoId: processo.id,
                titulo: ultimoMovimento.nome, // NOME REAL DO TRIBUNAL
                descricao: explicacaoIA,      // TRADUÇÃO DA IA
                autorNome: 'Assistente RCS (IA)',
                createdBy: usuario.id,
                codigoMovimento: ultimoMovimento.codigo,
                dataMovimento: dataUltimoMov,
                orgaoJulgador: dados.orgaoJulgador?.nome || 'Não informado',
                tribunal: dados.tribunal ?? null
              }
            });

            houveNovidade = true;
            resumoEmail += `
  <div style="margin-bottom:20px; border-left:4px solid #3498db; padding-left:15px; font-family: sans-serif;">
    <strong style="color: #2c3e50; font-size: 16px;">${processo.clienteNome}</strong><br>
    <span style="color: #7f8c8d; font-size: 13px;">Processo nº: <strong>${processo.numeroProcesso}</strong></span><br>
    <div style="margin-top: 8px;">
      <span style="font-weight: bold; color: #e67e22;">Movimentação: ${ultimoMovimento.nome}</span>
    </div>
    <p style="background:#f9f9f9; padding:12px; border-radius:4px; border: 1px solid #eee; margin-top:8px; line-height: 1.5;">
      <i style="color: #7f8c8d; font-size: 12px;">O que isso significa:</i><br>
      <span style="color: #34495e;">${explicacaoIA}</span>
    </p>
  </div>`;

            await new Promise(r => setTimeout(r, 600));

          } catch (err) {
            console.error(`❌ Erro:`, err);
          }
        }

        if (houveNovidade && usuario.email) {
          await this.mail.sendEmail(
            usuario.email,
            `Atualização de Processo: ${new Date().toLocaleDateString('pt-BR')}`,
            `<h2>Olá ${usuario.nome},</h2>
             <p>Identificamos novas movimentações oficiais nos seus processos:</p>
             ${resumoEmail}
             <p>Confira os detalhes no seu painel da RCS Gestão Jurídica.</p>`
          );
        }
      }
    } catch (err) {
      console.error('🔥 Erro Crítico:', err);
    }
  }
}