// import cron from 'node-cron';
// import { generateText } from 'ai';
// import { openai } from '@ai-sdk/openai';
// import { prisma } from '../../lib/prisma.js';

// // Importe seus serviços e providers
// import { DatajudService } from './datajud.service.js';
// import { MailService } from './mail-service.js';
// import { PJeProvider } from './scrapers/pje.provider.js';

// export class CronJobService {
//   private datajud = new DatajudService();
//   private mail = new MailService();
//   private pje = new PJeProvider();

//   constructor() {
//     console.log('📌 [SISTEMA] CronJob carregado: Título Real + Explicação IA.');
//   }

//   iniciarAgendamento() {
//     console.log('⏰ [CRON] Agendamento configurado para rodar todo dia às 04:00.');
//     cron.schedule('0 4 * * *', async () => {
//       await this.executarMonitoramento();
//     });
//   }

//   async executarMonitoramento() {
//     console.log('\n======================================================');
//     console.log(`⏳ [SISTEMA] Iniciando monitoramento híbrido... ${new Date().toLocaleString('pt-BR')}`);

//     try {
//       console.log('🔍 [BANCO] Buscando usuários ativos e com notificarPje=true...');
//       const usuarios = await prisma.user.findMany({
//         where: { ativo: true, notificarPje: true },
//         include: {
//           processos: { where: { arquivado: false, numeroProcesso: { not: null } } }
//         }
//       });

//       console.log(`👥 [USUÁRIOS] Encontrados ${usuarios.length} usuários para processar.`);

//       for (const usuario of usuarios) {
//         console.log(`\n👤 [USUÁRIO] Processando usuário ID: ${usuario.id} | Email: ${usuario.email}`);

//         if (!usuario.email || usuario.processos.length === 0) {
//           console.log(`⚠️ [PULO] Usuário ${usuario.id} ignorado (Sem e-mail ou sem processos).`);
//           continue;
//         }

//         console.log(`📂 [PROCESSOS] Usuário ${usuario.id} tem ${usuario.processos.length} processo(s).`);

//         let resumoEmail = '';
//         let houveNovidade = false;

//         for (const processo of usuario.processos) {
//           if (!processo.numeroProcesso) continue;
          
//           console.log(`  📄 [PROCESSO] Verificando ID: ${processo.id} | Nº: ${processo.numeroProcesso}`);

//           try {
//             let movimentosEmBruto: any[] = [];
//             let orgaoJulgador = 'Não informado';
//             let tribunal: string | null = null;
//             let fonteDados = '';

//             // =================================================================
//             // 🥇 TENTATIVA 1: PJe (Demais TJs, TRTs, TRFs) - Ignora e-SAJ (.8.26.)
//             // =================================================================
//             if (!processo.numeroProcesso.includes('.8.26.')) {
//               console.log(`  🕷️ [PJe] Iniciando scraping público...`);
//               const dadosPje = await this.pje.consultar(processo.numeroProcesso);

//               if (dadosPje && dadosPje.movimentacoes.length > 0) {
//                 console.log(`  🟢 [PJe] Sucesso! ${dadosPje.movimentacoes.length} movimentações.`);
//                 fonteDados = `PJe (${dadosPje.tribunal})`;
//                 orgaoJulgador = dadosPje.orgaoJulgador;
//                 tribunal = dadosPje.tribunal;
//                 movimentosEmBruto = dadosPje.movimentacoes.map(m => ({
//                   nome: m.titulo,
//                   dataHora: m.data,
//                   codigo: m.codigo,
//                 }));
//               }
//             }

//             // =================================================================
//             // 🥈 TENTATIVA 2: DATAJUD (Fallback ou processos do TJSP .8.26.)
//             // =================================================================
//             if (movimentosEmBruto.length === 0) {
//               console.log(`  📡 [DATAJUD] Consultando API pública do CNJ...`);
//               const dadosDatajud = await this.datajud.consultarMovimentacoes(processo.numeroProcesso);

//               if (dadosDatajud?.movimentos?.length) {
//                 console.log(`  🟢 [DATAJUD] Sucesso! Base nacional utilizada.`);
//                 movimentosEmBruto = dadosDatajud.movimentos;
//                 orgaoJulgador = dadosDatajud.orgaoJulgador?.nome || 'Não informado';
//                 tribunal = dadosDatajud.tribunal ?? null;
//                 fonteDados = 'Datajud CNJ';
//               }
//             }

//             // Se ainda não achou nada, pula para o próximo processo
//             if (movimentosEmBruto.length === 0) {
//               console.log(`  ⚠️ [PULO] Nenhuma movimentação encontrada para ${processo.numeroProcesso}.`);
//               continue;
//             }

//             // =================================================================
//             // PROCESSAMENTO E SALVAMENTO
//             // =================================================================
//             console.log(`  📊 [PROCESSAMENTO] Ordenando ${movimentosEmBruto.length} movimentação(ões)...`);

//             // Ordena da mais recente para a mais antiga garantindo que dataHora seja interpretada corretamente
//             const movimentos = [...movimentosEmBruto].sort((a, b) => {
//               const dateA = new Date(a.dataHora).getTime() || 0;
//               const dateB = new Date(b.dataHora).getTime() || 0;
//               return dateB - dateA;
//             });

//             const ultimoMovimento = movimentos[0];
//             if (!ultimoMovimento || !ultimoMovimento.nome) continue;

//             const dataUltimoMov = new Date(ultimoMovimento.dataHora);
//             if (isNaN(dataUltimoMov.getTime())) {
//                 console.warn(`  ⚠️ [AVISO] Data inválida detectada no movimento. Pulando...`);
//                 continue;
//             }

//             console.log(`  🔍 [BANCO] Verificando se já existe no banco...`);
//             const jaExiste = await prisma.andamento.findFirst({
//               where: {
//                 processoId: processo.id,
//                 titulo: ultimoMovimento.nome,
//                 dataMovimento: dataUltimoMov // Agora garantido como objeto Date válido
//               }
//             });

//             if (jaExiste) {
//               console.log(`  🛑 [PULO] Movimento já registrado. Sem novidades.`);
//               continue;
//             }

//             console.log(`  ✅ [NOVIDADE] Movimento novo! (${fonteDados}) -> ${ultimoMovimento.nome}`);

//             // --- PROMPT DA IA ---
//             let explicacaoIA = "O processo seguiu para uma nova fase interna.";
//             console.log(`  🤖 [IA] Solicitando explicação ao GPT...`);
//             try {
//               const { text } = await generateText({
//                 model: openai('gpt-4o-mini'),
//                 temperature: 0.1,
//                 system: `Você é um advogado especialista em traduzir "juridiquês" para linguagem simples e acessível ao cliente final. Seja direto, claro e tranquilizador.`,
//                 prompt: `Explique o que significa o andamento processual: "${ultimoMovimento.nome}" no contexto de um processo judicial. Limite a 3 frases.`
//               });
//               explicacaoIA = text.trim();
//             } catch (iaError: any) {
//               console.error(`  🔴 [IA - ERRO]: ${iaError.message}`);
//             }

//             // 💾 Salva no Banco de Dados
//             await prisma.andamento.create({
//               data: {
//                 processoId: processo.id,
//                 titulo: ultimoMovimento.nome,
//                 descricao: explicacaoIA,
//                 autorNome: `IA RCS (${fonteDados})`,
//                 createdBy: usuario.id,
//                 codigoMovimento: ultimoMovimento.codigo || 0,
//                 dataMovimento: dataUltimoMov,
//                 orgaoJulgador: orgaoJulgador,
//                 tribunal: tribunal
//               }
//             });

//             houveNovidade = true;
//             resumoEmail += `
//             <div style="margin-bottom:20px; border-left:4px solid #3498db; padding-left:15px; font-family: sans-serif;">
//               <strong style="color: #2c3e50; font-size: 16px;">${processo.clienteNome || 'Processo'}</strong><br>
//               <span style="color: #7f8c8d; font-size: 13px;">Processo nº: <strong>${processo.numeroProcesso}</strong></span><br>
//               <div style="margin-top: 8px;">
//                 <span style="font-weight: bold; color: #e67e22;">Movimentação: ${ultimoMovimento.nome}</span>
//                 <span style="font-size: 10px; color: #95a5a6; margin-left: 8px;">[Fonte: ${fonteDados}]</span>
//               </div>
//               <p style="background:#f9f9f9; padding:12px; border-radius:4px; border: 1px solid #eee; margin-top:8px; line-height: 1.5;">
//                 <i style="color: #7f8c8d; font-size: 12px;">O que isso significa?</i><br>
//                 <span style="color: #34495e;">${explicacaoIA}</span>
//               </p>
//             </div>`;

//             // Pequeno delay para aliviar o banco e não causar rate limit nas consultas e na IA
//             await new Promise(r => setTimeout(r, 1000));

//           } catch (err: any) {
//             console.error(`  ❌ [ERRO NO PROCESSO ${processo.numeroProcesso}]: ${err.message}`);
//           }
//         } // Fim do loop de processos

//         console.log(`\n📧 [EMAIL] Resumo para o usuário ${usuario.email}: Houve novidade? ${houveNovidade ? 'SIM' : 'NÃO'}`);
//         if (houveNovidade && usuario.email) {
//           console.log(`  🚀 [EMAIL] Tentando enviar e-mail para ${usuario.email}...`);
//           try {
//             await this.mail.sendEmail(
//               usuario.email,
//               `Atualização de Processo - ${new Date().toLocaleDateString('pt-BR')}`,
//               `<h2>Olá ${usuario.nome || ''},</h2>
//                <p>Identificamos novas movimentações oficiais nos seus processos:</p>
//                ${resumoEmail}
//                <p style="margin-top: 20px;">Confira os detalhes no seu painel da RCS Gestão Jurídica.</p>`
//             );
//             console.log(`  ✅ [EMAIL] E-mail enviado com sucesso!`);
//           } catch (emailError: any) {
//             console.error(`  ❌ [EMAIL - ERRO] Falha ao enviar e-mail: ${emailError.message}`);
//           }
//         }
//       } // Fim do loop de usuários
      
//       console.log('🏁 [SISTEMA] Monitoramento finalizado com sucesso.');
//       console.log('======================================================\n');
//     } catch (err) {
//       console.error('🔥 [ERRO CRÍTICO NO CRON]:', err);
//     }
//   }
// }


import cron from 'node-cron';
import { prisma } from '../../lib/prisma.js';
import { MailService } from './mail-service.js';

import { PJeProvider } from './scrapers/pje-provider.js';
import { ProcessRunner } from './scrapers/runner.js';

export class CronJobService {
  private mail = new MailService();
  private runner = new ProcessRunner(); // Instância do seu Runner!

  constructor() {
    console.log('📌 [SISTEMA] CronJob carregado: Delegação para o Runner ativa.');
  }

  iniciarAgendamento() {
    console.log('⏰ [CRON] Agendamento configurado para rodar todo dia às 04:00.');
    cron.schedule('0 4 * * *', async () => {
      await this.executarMonitoramento();
    });
  }

  async executarMonitoramento() {
    console.log('\n======================================================');
    console.log(`⏳ [SISTEMA] Iniciando monitoramento via Runner...`);

    try {
      const usuarios = await prisma.user.findMany({
        where: { ativo: true, notificarPje: true },
        include: {
          processos: { where: { arquivado: false, numeroProcesso: { not: null } } }
        }
      });

      for (const usuario of usuarios) {
        if (!usuario.email || usuario.processos.length === 0) continue;

        console.log(`\n👤 [USUÁRIO] Delegando ${usuario.processos.length} processos do usuário ${usuario.id} ao Runner...`);

        // 🚀 Aqui a mágica acontece: O Runner assume o trabalho pesado
        const resultado = await this.runner.processarLotesDoUsuario(usuario, usuario.processos);
        console.log(`RESULTADO' ${resultado}`)
        if (resultado.houveNovidade && usuario.email) {
          console.log(`  📧 [EMAIL] Novidades encontradas. Enviando para ${usuario.email}...`);
          try {
            await this.mail.sendEmail(
              usuario.email,
              `Atualização de Processo - ${new Date().toLocaleDateString('pt-BR')}`,
              `<h2>Olá ${usuario.nome || ''},</h2>
               <p>Identificamos novas movimentações oficiais nos seus processos:</p>
               ${resultado.resumoEmail}
               <p style="margin-top: 20px;">Confira os detalhes no seu painel.</p>`
            );
          } catch (err: any) {
            console.error(`  ❌ [EMAIL - ERRO]: ${err.message}`);
          }
        }
      }
      
      console.log('🏁 [SISTEMA] Monitoramento finalizado.');
      
      // Garante que o Chromium feche no final de toda a madrugada
      await PJeProvider.closeBrowser().catch(() => {});

    } catch (err) {
      console.error('🔥 [ERRO CRÍTICO NO CRON]:', err);
    }
  }
}