import cron from 'node-cron';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '../../lib/prisma.js';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export class CronJobService {
  constructor() {
    console.log('📌 [SISTEMA] CronJob carregado: Leitor de E-mails IMAP do Astrea ativo.');
  }

  iniciarAgendamento() {
    // Roda a cada 30 minutos (Ajuste conforme a necessidade)
    cron.schedule('*/30 * * * *', async () => {
      await this.processarEmailsDeAndamento();
    });
  }

async processarEmailsDeAndamento() {
    console.log('⏳ [SISTEMA] Verificando novos e-mails do Astrea...');

    // CORREÇÃO 1 (TS2322): Garantimos para o TS que essas variáveis são strings
    const host = process.env.IMAP_HOST as string;
    const user = process.env.IMAP_USER as string;
    const pass = process.env.IMAP_PASS as string;

    // Trava de segurança caso falte alguma variável no .env
    if (!host || !user || !pass) {
      console.error('🔥 [ERRO IMAP]: Configurações de e-mail ausentes no arquivo .env.');
      return;
    }

    const client = new ImapFlow({
      host,
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false 
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      
      try {
        const messages = client.fetch({ 
          seen: false, 
          from: 'astrea@aurum.com.br' 
        }, { source: true, uid: true });

        for await (let msg of messages) {
          // CORREÇÃO 2 (TS2345): Ignora a mensagem se o source vier vazio
          if (!msg.source) {
            continue;
          }

          // CORREÇÃO 3 (TS2339 e TS2345): O "as Buffer" diz ao TypeScript 
          // exatamente o formato do dado, fazendo o .text ser reconhecido.
          const parsed = await simpleParser(msg.source as Buffer);
          const corpoEmail = parsed.text || '';

          const dadosExtraidos = await this.extrairDadosDoEmail(corpoEmail);

          if (dadosExtraidos && dadosExtraidos.numeroProcesso && dadosExtraidos.andamentos.length > 0) {
            const processo = await prisma.processo.findFirst({
              where: { numeroProcesso: { contains: dadosExtraidos.numeroProcesso } }
            });

            if (processo) {
              for (const andamento of dadosExtraidos.andamentos) {
                await prisma.andamento.create({
                  data: {
                    processoId: processo.id,
                    titulo: andamento.titulo,
                    descricao: andamento.descricao,
                    dataMovimento: new Date(`${andamento.dataMovimento}T12:00:00.000Z`), 
                    createdBy: processo.userId, 
                    autorNome: "Astrea (Via E-mail)"
                  }
                });
              }

              await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
              console.log(`✅ ${dadosExtraidos.andamentos.length} andamento(s) salvo(s) para o processo ${processo.numeroProcesso}`);
            } else {
              console.log(`⚠️ Processo ${dadosExtraidos.numeroProcesso} não encontrado na base de dados.`);
            }
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error('🔥 [ERRO IMAP]:', err);
    } finally {
      await client.logout();
    }
  }

  // A função com IA usando Vercel AI SDK
  private async extrairDadosDoEmail(textoEmail: string) {
    try {
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        temperature: 0, // Máxima precisão
        schema: z.object({
          numeroProcesso: z.string().describe("Número completo do processo judicial, exatamente como está no e-mail (ex: 8000792-04.2024.8.05.0148)"),
          andamentos: z.array(z.object({
            dataMovimento: z.string().describe("Data do andamento extraída do e-mail, convertida rigorosamente para o formato AAAA-MM-DD"),
            titulo: z.string().describe("Resumo curto do andamento para servir de título, extraído do início da frase (ex: 'Publicado Ato Ordinatório')"),
            descricao: z.string().describe("O texto completo da movimentação ou intimação fornecido no e-mail")
          })).describe("Lista de todos os andamentos listados no e-mail para o processo.")
        }),
        system: "Você é um assistente de extração de dados jurídicos. O usuário vai enviar o corpo de texto de um e-mail automatizado do sistema Astrea. Seu objetivo é identificar o número do processo (geralmente rotulado como 'Número:') e extrair cada um dos andamentos listados no bloco de atualizações, devolvendo-os formatados.",
        prompt: `Analise o seguinte e-mail do Astrea e extraia os dados solicitados:\n\n${textoEmail}`
      });

      return object;
    } catch (error) {
      console.error("Erro na extração de dados com IA:", error);
      return null;
    }
  }
}