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
    // Rodando a cada 30 minutos para proteger os limites da OpenAI e do Servidor
    cron.schedule('*/30 * * * *', async () => {
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
      clientInfo: { name: 'NobreGestao' },
      connectionTimeout: 30000,
      socketTimeout: 60000,
      greetingTimeout: 30000
    });

    client.on('error', (err) => { /* Ignora erros silenciosos */ });

    let lock: any = null;

    try {
      await client.connect();
      lock = await client.getMailboxLock('INBOX');
      
      try {
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - 3);

        // ================================================================
        // 🚨 TRAVAS DE CUSTO ABSOLUTO (ANTI-FALÊNCIA DA OPENAI) 🚨
        // ================================================================
        const messages = client.fetch({ 
          since: dataLimite, 
          flagged: false, // 👈 TRAVA 1: Só lê o que for novidade (Não lido)
          from: 'astrea@aurum.com.br' // 👈 TRAVA 2: Só lê se for do sistema jurídico
        }, { source: true, uid: true });

        for await (let msg of messages) {
          if (!msg.source) continue;

          const parsed = await simpleParser(msg.source as Buffer);
          const corpoEmail = parsed.text || '';

          // A IA só é acionada aqui para e-mails INÉDITOS
          const dadosExtraidos = await this.extrairDadosDoEmail(corpoEmail);

          if (dadosExtraidos && dadosExtraidos.numeroProcesso && dadosExtraidos.andamentos.length > 0) {
            
            let processo = await prisma.processo.findFirst({
              where: { numeroProcesso: { contains: dadosExtraidos.numeroProcesso } }
            });

            // ================================================================
            // 🚀 CRIAÇÃO AUTOMÁTICA DE PROCESSO ÓRFÃO (COM CORREÇÃO DE CPF)
            // ================================================================
            if (!processo) {
              console.log(`⚠️ Processo ${dadosExtraidos.numeroProcesso} não encontrado. Criando automaticamente...`);
              
              // 1. Pega um usuário (advogado) padrão do sistema para ser o dono
              const adminUser = await prisma.user.findFirst({ where: { email: user } }) || await prisma.user.findFirst();
              if (!adminUser) continue; // Trava de segurança

              // 2. Busca ou Cria o Cliente
              const nomeDoCliente = dadosExtraidos.nomeCliente || "Cliente Astrea (Automático)";
              let cliente = await prisma.cliente.findFirst({
                where: { nome: { contains: nomeDoCliente, mode: 'insensitive' } }
              });

              if (!cliente) {
                const identificadorUnico = Math.floor(Math.random() * 10000000);
                
                cliente = await prisma.cliente.create({
                  data: {
                    nome: nomeDoCliente,
                    // 👇 CORREÇÃO CRÍTICA DO BANCO DE DADOS: Gera CPF/Telefone únicos
                    cpf: `ASTREA-CPF-${identificadorUnico}`, 
                    telefone: `ASTREA-TEL-${identificadorUnico}`, 
                  }
                });
              }

              // 3. Cria o processo no banco
              processo = await prisma.processo.create({
                data: {
                  numeroProcesso: dadosExtraidos.numeroProcesso,
                  numeroInterno: dadosExtraidos.numeroProcesso.replace(/\D/g, ''),
                  descricaoObjeto: "Processo identificado via Leitor de E-mails",
                  responsavel: adminUser.nome,
                  tipoHonorarios: "A Definir",
                  clienteId: cliente.id,
                  clienteNome: cliente.nome,
                  userId: adminUser.id,
                  statusGeral: "Triagem Inicial"
                }
              });
              
              console.log(`✅ Processo criado com sucesso no nome de ${cliente.nome}!`);
            }
            // ================================================================

            // Salva os andamentos no processo (seja ele antigo ou recém-criado)
            let salvosNestaLeitura = 0;

            for (const andamento of dadosExtraidos.andamentos) {
              const andamentoJaExiste = await prisma.andamento.findFirst({
                where: {
                  processoId: processo.id,
                  titulo: andamento.titulo,
                  descricao: andamento.descricao
                }
              });

              if (!andamentoJaExiste) {
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
                salvosNestaLeitura++;
              }
            }

            if (salvosNestaLeitura > 0) {
              console.log(`✅ ${salvosNestaLeitura} andamento(s) INÉDITO(s) salvo(s) para o processo ${processo.numeroProcesso}`);
            }

            // 👇 TRAVA 3: Marca o e-mail como LIDO no Gmail para a IA NUNCA MAIS ler ele
            await client.messageFlagsAdd({ uid: msg.uid }, ['\\Flagged', '\\Seen'], { uid: true });
          }
        }
      } finally {
        // Tenta liberar o lock sem crashar se a internet tiver caído
        try { if (lock) lock.release(); } catch (e) { }
      }
    } catch (err: any) {
      console.error('🔥 [ERRO IMAP]:', err.message);
    } finally {
      // Tenta fazer o logout de forma segura
      try { await client.logout(); } catch (e) { }
    }
  }

  private async extrairDadosDoEmail(textoEmail: string) {
    try {
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        temperature: 0,
        schema: z.object({
          numeroProcesso: z.string().describe("Número completo do processo judicial, exatamente como está no e-mail"),
          // 👇 INSTRUÇÃO PARA A IA PEGAR O NOME DO CLIENTE
          nomeCliente: z.string().describe("Nome do cliente dono do processo mencionado no e-mail (ex: João da Silva). Se não houver nome, retorne string vazia."),
          andamentos: z.array(z.object({
            dataMovimento: z.string().describe("Data do andamento no formato AAAA-MM-DD"),
            titulo: z.string().describe("Resumo curto do andamento para título"),
            descricao: z.string().describe("O texto completo da movimentação ou intimação")
          })).describe("Lista de andamentos do e-mail.")
        }),
        system: "Você é um assistente de extração de dados jurídicos. O usuário vai enviar um e-mail. Identifique o número do processo, o nome do cliente (se houver) e os andamentos.",
        prompt: `Extraia os dados solicitados:\n\n${textoEmail}`
      });

      return object;
    } catch (error) {
      console.error("Erro na extração de dados com IA:", error);
      return null;
    }
  }
}