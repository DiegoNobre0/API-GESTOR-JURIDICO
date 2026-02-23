import { DatajudService } from './infra/services/datajud.service.js';
import { MailService } from './infra/services/mail-service.js';
import { prisma } from './lib/prisma.js';

const datajud = new DatajudService();
const mail = new MailService();

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testarRoboReal() {
  console.log('🚀 Iniciando TESTE REAL na API do DataJud...\n');

  try {
    const usuarios = await prisma.user.findMany({
      where: { ativo: true },
      include: {
        processos: {
          where: {
            arquivado: false,
            numeroProcesso: { not: null }
          }
        }
      }
    });

    if (!usuarios.length) {
      console.log('⚠️ Nenhum usuário ativo encontrado.');
      return;
    }

    for (const usuario of usuarios) {
      if (!usuario.email || !usuario.processos.length) continue;

      console.log(`👨‍⚖️ Verificando processos do Dr(a). ${usuario.nome}...`);

      let resumoEmail = '';
      let houveNovidade = false;

      for (const processo of usuario.processos) {
        try {
          const dados = await datajud.consultarMovimentacoes(
            processo.numeroProcesso!
          );

          if (!dados?.movimentos?.length) {
            console.log('   ⚪ Nenhum movimento encontrado.');
            continue;
          }

          // Ordena do mais recente para o mais antigo
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

          const textoMovimento = `${dataMov.toLocaleDateString(
            'pt-BR'
          )} - ${nomeMov}`;

          const jaExiste = await prisma.andamento.findFirst({
            where: {
              processoId: processo.id,
              codigoMovimento: codigoMov,
              dataMovimento: dataMov
            }
          });

          if (jaExiste) {
            console.log(`   ✅ Sem novidade para ${processo.numeroProcesso}`);
            continue;
          }

          console.log(`   🤖 Novo movimento detectado: ${nomeMov}`);

          await prisma.andamento.create({
            data: {
              processoId: processo.id,
              titulo: nomeMov,
              descricao: textoMovimento,
              autorNome: 'Robô de Monitoramento',
              createdBy: usuario.id,
              codigoMovimento: codigoMov,
              dataMovimento: dataMov
            }
          });

          houveNovidade = true;

          resumoEmail += `
            <div style="margin-bottom: 20px; border-left: 4px solid #2c3e50; padding-left: 15px;">
              <h4 style="margin: 0; color: #2c3e50;">
                Processo: ${processo.numeroProcesso}
              </h4>
              <p style="margin: 5px 0; font-size: 13px;">
                <strong>NOVO:</strong> ${textoMovimento}
              </p>
            </div>
          `;

          await delay(1000);

        } catch (erroProcesso) {
          console.error(
            `❌ Erro no processo ${processo.numeroProcesso}`,
            erroProcesso
          );
        }
      }

      if (houveNovidade) {
        const htmlFinal = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
            <h2>Olá ${usuario.nome},</h2>
            <p>Foram detectadas novas movimentações:</p>
            ${resumoEmail}
          </div>
        `;

        await mail.sendEmail(
          usuario.email,
          `Atualização Jurídica - ${new Date().toLocaleDateString('pt-BR')}`,
          htmlFinal
        );

        console.log('📧 E-mail enviado.');
      } else {
        console.log('📭 Nenhuma movimentação nova.');
      }
    }
  } catch (error) {
    console.error('❌ Erro fatal:', error);
  } finally {
    await prisma.$disconnect();
    console.log('🏁 Teste finalizado.');
  }
}

testarRoboReal();