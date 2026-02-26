import cron from 'node-cron';
import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import { prisma } from '../../lib/prisma.js';
import { DatajudService } from './datajud.service.js';
import { MailService } from './mail-service.js';


console.log('📌 [SISTEMA] Arquivo de agendamento do Datajud (04h00) carregado na memória!');


cron.schedule('0 4 * * *', async () => {
  console.log('⏳ [CRON] Iniciando monitoramento inteligente...');

  const datajud = new DatajudService();
  const mail = new MailService();

  try {
    const usuarios = await prisma.user.findMany({
      where: {
        ativo: true,
        notificarPje: true
      },
      include: {
        processos: {
          where: {
            arquivado: false,
            numeroProcesso: { not: null }
          }
        }
      }
    });

    for (const usuario of usuarios) {
      if (!usuario.email || usuario.processos.length === 0) continue;

      let resumoEmail = '';
      let houveNovidade = false;

      console.log(`👤 Processando usuário: ${usuario.nome}`);

      for (const processo of usuario.processos) {
        try {
          if (!processo.numeroProcesso) continue;

          const apenasNumeros = processo.numeroProcesso.replace(/\D/g, '');

          if (apenasNumeros.length !== 20) {
            console.log(`⏭️ Ignorando busca: ${processo.numeroProcesso} (Não é formato CNJ)`);
            continue; // Pula para o próximo item da lista
          }

          console.log(`🔎 Processo: ${processo.numeroProcesso}`);


          const dados = await datajud.consultarMovimentacoes(
            processo.numeroProcesso
          );

          if (!dados?.movimentos?.length) {
            console.log('⚪ Nenhum movimento encontrado.');
            continue;
          }

          // 🔥 Ordena do mais recente para o mais antigo
          const movimentosOrdenados = [...dados.movimentos].sort(
            (a, b) =>
              new Date(b.dataHora).getTime() -
              new Date(a.dataHora).getTime()
          );

          const ultimoMovimento = movimentosOrdenados[0];

          if (!ultimoMovimento) {
            console.log('⚪ Nenhum movimento válido após ordenação.');
            continue;
          }

          const codigoMov = ultimoMovimento.codigo;
          const nomeMov = ultimoMovimento.nome;
          const dataMov = new Date(ultimoMovimento.dataHora);
          const orgao = ultimoMovimento.orgaoJulgador?.nome ?? null;
          const tribunal = dados.tribunal ?? null;

          // ✅ Anti-duplicação
          const jaExiste = await prisma.andamento.findFirst({
            where: {
              processoId: processo.id,
              codigoMovimento: codigoMov,
              dataMovimento: dataMov
            }
          });

          if (jaExiste) {
            console.log(`✅ Sem novidade para ${processo.numeroProcesso}`);
            continue;
          }

          console.log(`🤖 Novo movimento detectado: ${nomeMov}`);

          // 🤖 Geração de resumo IA
          let resumoAmigavel = nomeMov;

          try {
            const { text } = await generateText({
              model: groq('llama-3.3-70b-versatile'),
              temperature: 0.2,
              system: `
Você é assistente jurídico da RCS Gestão Jurídica.
Explique movimentações judiciais para clientes leigos.
Use linguagem simples e até 180 caracteres.
              `,
              prompt: `
Explique de forma simples:

Movimento: ${nomeMov}
Data: ${dataMov.toLocaleDateString('pt-BR')}
Vara: ${orgao ?? 'Não informado'}
Tribunal: ${tribunal ?? 'Não informado'}
              `
            });

            resumoAmigavel = text.trim();
          } catch {
            console.log('⚠ Erro na IA, usando texto original.');
          }

          // 💾 Salva andamento
          await prisma.andamento.create({
            data: {
              processoId: processo.id,
              titulo: nomeMov,
              descricao: resumoAmigavel,
              autorNome: 'Assistente RCS (IA)',
              createdBy: usuario.id,

              codigoMovimento: codigoMov,
              dataMovimento: dataMov,
              orgaoJulgador: orgao,
              tribunal: tribunal
            }
          });

          houveNovidade = true;

          resumoEmail += `
            <div style="margin-bottom:20px;border-left:4px solid #27ae60;padding-left:15px;">
              <strong>${processo.clienteNome}</strong><br>
              <span style="color:#2e7d32;">● ${resumoAmigavel}</span><br>
              <small>${dataMov.toLocaleDateString('pt-BR')}</small>
            </div>
          `;

          // Anti rate-limit
          await new Promise(r => setTimeout(r, 700));

        } catch (erroProcesso) {
          console.error(
            `❌ Erro no processo ${processo.numeroProcesso}`,
            erroProcesso
          );
        }
      }

      // 📧 Envio consolidado
      if (houveNovidade) {
        console.log(`📧 Enviando e-mail para ${usuario.email}`);

        const htmlFinal = `
          <h2>Olá ${usuario.nome},</h2>
          <p>Detectamos novas movimentações em seus processos:</p>
          ${resumoEmail}
          <br>
          <p>Equipe RCS Gestão Jurídica</p>
        `;

        await mail.sendEmail(
          usuario.email,
          `Atualização Jurídica - ${new Date().toLocaleDateString('pt-BR')}`,
          htmlFinal
        );
      }
    }

    console.log('✅ [CRON] Monitoramento finalizado com sucesso.');

  } catch (erroGeral) {
    console.error('🔥 ERRO CRÍTICO NO CRON:', erroGeral);
  }
});