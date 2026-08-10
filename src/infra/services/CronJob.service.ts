import cron from 'node-cron';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '../../lib/prisma.js';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export class CronJobService {
  constructor() {
    console.log('📌 [SISTEMA] CronJob carregado: Leitor de E-mails IMAP ativo.');
  }

  iniciarAgendamento() {
    // 👇 Mudei para rodar a CADA 1 MINUTO para facilitar os testes. 
    // Depois que der certo, volte para '*/30 * * * *'
    cron.schedule('* * * * *', async () => {
      await this.processarEmailsDeAndamento();
    });
  }

  async processarEmailsDeAndamento() {
    console.log('⏳ [SISTEMA] Verificando novos e-mails...');

    const host = process.env.IMAP_HOST as string;
    const user = process.env.IMAP_USER as string;
    const pass = process.env.IMAP_PASS as string;

    if (!host || !user || !pass) {
      console.error('🔥 [ERRO IMAP]: Configurações de e-mail ausentes no arquivo .env.');
      return;
    }

    const client = new ImapFlow({
      host,
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
      // 👇 PROTEÇÃO CONTRA TIMEOUT E QUEDAS DO GMAIL
      clientInfo: { name: 'NobreGestao' },
      connectionTimeout: 30000,
      socketTimeout: 60000,
      greetingTimeout: 30000
    });

    // 👇 ESCUDO ANTI-CRASH: Evita que erros de rede derrubem a API
    client.on('error', (err) => {
      console.error('⚠️ [IMAP] Erro silencioso de conexão (ignorado):', err.message);
    });

    client.on('close', () => {
      console.log('⚠️ [IMAP] Conexão fechada pelo servidor. Tentará novamente no próximo ciclo.');
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      
      try {
        const messages = client.fetch({ 
          seen: false, 
          // 👇 COMENTADO PARA O TESTE: Assim ele lê e-mails não lidos enviados por você também!
          // from: 'astrea@aurum.com.br' 
        }, { source: true, uid: true });

        for await (let msg of messages) {
          if (!msg.source) {
            continue;
          }

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

  private async extrairDadosDoEmail(textoEmail: string) {
    try {
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        temperature: 0,
        schema: z.object({
          numeroProcesso: z.string().describe("Número completo do processo judicial, exatamente como está no e-mail (ex: 8000792-04.2024.8.05.0148)"),
          andamentos: z.array(z.object({
            dataMovimento: z.string().describe("Data do andamento extraída do e-mail, convertida rigorosamente para o formato AAAA-MM-DD"),
            titulo: z.string().describe("Resumo curto do andamento para servir de título, extraído do início da frase (ex: 'Publicado Ato Ordinatório')"),
            descricao: z.string().describe("O texto completo da movimentação ou intimação fornecido no e-mail")
          })).describe("Lista de todos os andamentos listados no e-mail para o processo.")
        }),
        system: "Você é um assistente de extração de dados jurídicos. O usuário vai enviar o corpo de texto de um e-mail. Seu objetivo é identificar o número do processo e extrair cada um dos andamentos listados no bloco de atualizações, devolvendo-os formatados.",
        prompt: `Analise o seguinte e-mail e extraia os dados solicitados:\n\n${textoEmail}`
      });

      return object;
    } catch (error) {
      console.error("Erro na extração de dados com IA:", error);
      return null;
    }
  }
}