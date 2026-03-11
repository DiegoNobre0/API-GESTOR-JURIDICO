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
    console.log('📌 [SISTEMA] Serviço de Agendamento (CronJob) inicializado!');
  }

  /**
   * Inicia o agendamento automático para as 04h00
   */
  async iniciarAgendamento() {
    cron.schedule('0 4 * * *', async () => {
      await this.executarMonitoramento();
    });
    console.log('⏰ [CRON] Agendamento automático configurado para as 04h00.');
  }

  /**
   * Executa a lógica de monitoramento. 
   * Pode ser chamado pelo Cron ou manualmente por uma rota de teste.
   */
  async executarMonitoramento() {
    console.log('⏳ [SISTEMA] Iniciando monitoramento com Resumo Geral por IA...');

    try {
      const usuarios = await prisma.user.findMany({
        where: { ativo: true, notificarPje: true },
        include: {
          processos: {
            where: { arquivado: false, numeroProcesso: { not: null } }
          }
        }
      });

      for (const usuario of usuarios) {
        if (!usuario.email || usuario.processos.length === 0) continue;

        let resumoEmail = '';
        let houveNovidade = false;

        console.log(`👤 Processando usuário: ${usuario.nome} (${usuario.processos.length} processos)`);

        for (const processo of usuario.processos) {
          try {
            // Segurança: Garantir que numeroProcesso existe (TS Guard)
            if (!processo.numeroProcesso) continue;

            const dados = await this.datajud.consultarMovimentacoes(processo.numeroProcesso);
            if (!dados?.movimentos?.length) continue;

            // 1. Ordenação dos movimentos (mais recente primeiro)
            const movimentos = [...dados.movimentos].sort(
              (a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()
            );

            const ultimoMovimento = movimentos[0];
            
            // Segurança: Type Guard para o último movimento
            if (!ultimoMovimento) continue;

            const dataUltimoMov = new Date(ultimoMovimento.dataHora);

            // 2. Anti-duplicação: Verifica se este movimento exato já foi salvo
            const jaExiste = await prisma.andamento.findFirst({
              where: {
                processoId: processo.id,
                codigoMovimento: ultimoMovimento.codigo,
                dataMovimento: dataUltimoMov
              }
            });

            if (jaExiste) {
              console.log(`✅ Processo ${processo.numeroProcesso} já está atualizado.`);
              continue;
            }

            console.log(`🤖 Novidade detectada: ${processo.numeroProcesso}. Gerando panorama...`);

            // 3. Preparação do histórico para a IA
            const historicoSimplificado = movimentos.slice(0, 10).map(m => 
              `- ${new Date(m.dataHora).toLocaleDateString('pt-BR')}: ${m.nome}`
            ).join('\n');

            const assuntosStr = dados.assuntos?.map((a: any) => a.nome).join(', ') || 'Não informados';
            const varaNome = dados.orgaoJulgador?.nome || 'Vara não informada';

            // 4. Chamada da IA para Resumo Contextual
            let resumoPanorama = '';
            try {
              const { text } = await generateText({
                model: openai('gpt-4o-mini'),
                temperature: 0.3,
                system: `Você é um advogado sênior da RCS Gestão Jurídica. Explique a situação para o cliente de forma simples e humana (máx 250 caracteres). Evite juridiquês pesado.`,
                prompt: `Número: ${processo.numeroProcesso}\nAssuntos: ${assuntosStr}\nVara: ${varaNome}\nHistórico Recente:\n${historicoSimplificado}\n\nResuma o que aconteceu de mais importante e o que significa agora.`
              });
              resumoPanorama = text.trim();
            } catch (err) {
              resumoPanorama = `Identificamos uma nova movimentação: ${ultimoMovimento.nome}. Verifique seu painel para mais detalhes.`;
            }

            // 5. Salva o Andamento no Banco
            await prisma.andamento.create({
              data: {
                processoId: processo.id,
                titulo: `Situação Atual: ${ultimoMovimento.nome}`,
                descricao: resumoPanorama,
                autorNome: 'Analista RCS (IA)',
                createdBy: usuario.id,
                codigoMovimento: ultimoMovimento.codigo,
                dataMovimento: dataUltimoMov,
                orgaoJulgador: varaNome,
                tribunal: dados.tribunal ?? null
              }
            });

            houveNovidade = true;
            resumoEmail += `
              <div style="margin-bottom:20px; border-left:4px solid #3498db; padding-left:15px;">
                <strong style="color: #2c3e50;">${processo.clienteNome}</strong><br>
                <small style="color: #7f8c8d;">Processo: ${processo.numeroProcesso}</small>
                <p style="background:#f9f9f9; padding:12px; border-radius:6px; margin-top:8px; color: #34495e;">
                  <strong>Panorama:</strong> ${resumoPanorama}
                </p>
              </div>`;

            // Anti rate-limit para Datajud e OpenAI
            await new Promise(r => setTimeout(r, 800));

          } catch (err) {
            console.error(`❌ Erro ao processar processo ${processo.numeroProcesso}:`, err);
          }
        }

        // 6. Envio do E-mail Consolidado por Usuário
        if (houveNovidade && usuario.email) {
          console.log(`📧 Enviando e-mail de atualização para ${usuario.email}`);
          await this.mail.sendEmail(
            usuario.email,
            `Atualização Jurídica - ${new Date().toLocaleDateString('pt-BR')}`,
            `<h2>Olá ${usuario.nome},</h2>
             <p>Nossa inteligência jurídica detectou novidades nos seus processos:</p>
             ${resumoEmail}
             <p style="margin-top:20px;">Atenciosamente,<br><strong>Equipe RCS Gestão Jurídica</strong></p>`
          );
        }
      }

      console.log('✅ [SISTEMA] Monitoramento finalizado com sucesso.');
      return { success: true, message: "Monitoramento concluído." };

    } catch (err) {
      console.error('🔥 ERRO CRÍTICO NO SERVIÇO DE MONITORAMENTO:', err);
      throw err;
    }
  }
}