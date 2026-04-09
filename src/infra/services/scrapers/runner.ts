// src/services/scrapers/process-runner.ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { rotearConsulta, rotearComUrl } from './tribunal-router.js';
import { prisma } from '@/lib/prisma.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { BaseScraper } from './base.scraper.js';

const _filename = typeof __filename !== 'undefined' 
  ? __filename 
  : fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Tipos do dados.json ───────────────────────────────────────────────────────
interface EntradaTeste {
  numero: string;
  url: string;
}
interface DadosJson {
  [sistema: string]: Record<string, Record<string, EntradaTeste[]>>;
}

// ── Resultado de cada caso testado ────────────────────────────────────────────
interface ResultadoTeste {
  sistema: string;
  tribunal: string;
  grau: string;
  numero: string;
  url: string;
  ok: boolean;
  movimentacoes: number;
  erro?: string;
}

export class ProcessRunner {
  private TAMANHO_LOTE = 1;

  // ── PRODUÇÃO ─────────────────────────────────────────────────────────────────

  async processarLotesDoUsuario(usuario: any, processos: any[]) {
    let resumoEmail = '';
    let houveNovidade = false;

    for (let i = 0; i < processos.length; i += this.TAMANHO_LOTE) {
      const lote = processos.slice(i, i + this.TAMANHO_LOTE);
      console.log(`  📦 [LOTE] Processando processos ${i + 1} a ${i + lote.length}...`);

      const resultadosLote = await Promise.all(
        lote.map(processo => this.processarUnicoProcesso(processo, usuario))
      );

      for (const resultado of resultadosLote) {
        if (resultado?.houveNovidade) {
          houveNovidade = true;
          resumoEmail += resultado.htmlResumo;
        }
      }

      if (i + this.TAMANHO_LOTE < processos.length) {
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    return { houveNovidade, resumoEmail };
  }

  private async processarUnicoProcesso(processo: any, usuario: any) {
    if (!processo.numeroProcesso) return null;

    // Guard: CNJ precisa de 20 dígitos
    const digits = processo.numeroProcesso.replace(/[^\d]/g, '');
    if (digits.length !== 20) {
      console.warn(`⚠️ [Runner] CNJ inválido (${digits.length} dígitos): ${processo.numeroProcesso}`);
      return null;
    }

    try {
      const resultado = await rotearConsulta(
        processo.numeroProcesso,
        processo.id,
        processo.sistemaOrigem,
      );

      if (!resultado || resultado.movimentacoes.length === 0) return null;

      const movimentos = [...resultado.movimentacoes].sort((a, b) => {
        const dateA = new Date(a.data).getTime() || 0;
        const dateB = new Date(b.data).getTime() || 0;
        return dateB - dateA;
      });

      const ultimoMovimento: any = movimentos[0];
      const dataUltimoMov = new Date(ultimoMovimento.data);

      if (!ultimoMovimento.titulo || isNaN(dataUltimoMov.getTime())) return null;

      const jaExiste = await prisma.andamento.findFirst({
        where: {
          processoId: processo.id,
          titulo: ultimoMovimento.titulo,
          dataMovimento: dataUltimoMov,
        },
      });

      if (jaExiste) return null;

      let explicacaoIA = 'O processo seguiu para uma nova fase interna.';
      try {
        const { text } = await generateText({
          model: openai('gpt-4o-mini'),
          temperature: 0.1,
          system: 'Você é um advogado especialista em traduzir "juridiquês" para linguagem simples. Seja direto e tranquilizador.',
          prompt: `Explique o que significa: "${ultimoMovimento.titulo}" no contexto judicial. Limite a 3 frases.`,
        });
        explicacaoIA = text.trim();
      } catch { /* usa texto padrão silenciosamente */ }

      await prisma.andamento.create({
        data: {
          processoId: processo.id,
          titulo: ultimoMovimento.titulo,
          descricao: explicacaoIA,
          autorNome: `IA RCS (${resultado.sistemaOrigem})`,
          createdBy: usuario.id,
          codigoMovimento: ultimoMovimento.codigo || 0,
          dataMovimento: dataUltimoMov,
          orgaoJulgador: resultado.orgaoJulgador,
          tribunal: resultado.tribunal,
        },
      });

      const htmlResumo = `
      <div style="margin-bottom:20px; border-left:4px solid #3498db; padding-left:15px; font-family: sans-serif;">
        <strong style="color: #2c3e50; font-size: 16px;">${processo.clienteNome || 'Processo'}</strong><br>
        <span style="color: #7f8c8d; font-size: 13px;">Processo nº: <strong>${processo.numeroProcesso}</strong></span><br>
        <div style="margin-top: 8px;">
          <span style="font-weight: bold; color: #e67e22;">Movimentação: ${ultimoMovimento.titulo}</span>
        </div>
        <p style="background:#f9f9f9; padding:12px; border-radius:4px; border: 1px solid #eee; margin-top:8px;">
          <span style="color: #34495e;">${explicacaoIA}</span>
        </p>
      </div>`;

      return { houveNovidade: true, htmlResumo };

    } catch {
      return null;
    }
  }

  async testarDados(filtros: {
    sistema?: string;
    tribunal?: string;
    grau?: string;
    index?: number;       // qual processo dentro da lista (0, 1...). Omitir = todos
  } = {}) {

    const raw = readFileSync(join(__dirname, 'dados.json'), 'utf-8');
    const dados = JSON.parse(raw) as DadosJson;

    const resultados: ResultadoTeste[] = [];

    for (const [sistema, tribunais] of Object.entries(dados)) {
      if (filtros.sistema && sistema !== filtros.sistema) continue;

      for (const [tribunal, graus] of Object.entries(tribunais)) {
        if (filtros.tribunal && tribunal !== filtros.tribunal) continue;

        for (const [grau, entradas] of Object.entries(graus)) {
          if (filtros.grau && grau !== filtros.grau) continue;

          // Determina quais índices testar
          const indices = filtros.index !== undefined
            ? [filtros.index]
            : entradas.map((_, i) => i);

          for (const i of indices) {
            const entrada = entradas[i];
            if (!entrada) continue;

            console.log(`\n${'─'.repeat(60)}`);
            console.log(`🧪 [Teste] ${sistema} › ${tribunal} › ${grau} › índice ${i}`);
            console.log(`   Processo : ${entrada.numero}`);
            console.log(`   URL      : ${entrada.url}`);

            try {
              const resultado: any = await rotearComUrl(entrada.numero, sistema, entrada.url);

              const ok = resultado !== null && resultado.movimentacoes.length > 0;
              const res: ResultadoTeste = {
                sistema, tribunal, grau,
                numero: entrada.numero,
                url: entrada.url,
                ok,
                movimentacoes: resultado?.movimentacoes.length ?? 0,
              };

              if (ok) {
                console.log(`   ✅ OK — ${res.movimentacoes} movimentação(ões) encontrada(s)`);
                console.log(`   📄 Última: "${resultado!.movimentacoes[0].titulo}"`);
              } else {
                res.erro = resultado === null ? 'Retornou null' : 'Lista vazia';
                console.log(`   ❌ FALHOU — ${res.erro}`);
              }

              resultados.push(res);

            } catch (err: any) {
              console.log(`   💥 ERRO — ${err.message}`);
              resultados.push({
                sistema, tribunal, grau,
                numero: entrada.numero, url: entrada.url,
                ok: false, movimentacoes: 0, erro: err.message,
              });
            }

            // Pausa entre requisições para não sobrecarregar o tribunal
            await new Promise(r => setTimeout(r, 5000));
          }
        }
      }
    }

    // ── Resumo final ──────────────────────────────────────────────────────────
    const ok = resultados.filter(r => r.ok);
    const falhou = resultados.filter(r => !r.ok);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESUMO DO TESTE`);
    console.log(`   Total   : ${resultados.length}`);
    console.log(`   ✅ OK   : ${ok.length}`);
    console.log(`   ❌ Falha: ${falhou.length}`);

    if (falhou.length > 0) {
      console.log(`\n❌ Falhas:`);
      for (const f of falhou) {
        console.log(`   ${f.sistema} › ${f.tribunal} › ${f.grau} — ${f.numero}`);
        console.log(`   └─ ${f.erro}`);
      }
    }

    console.log(`${'═'.repeat(60)}\n`);

    await BaseScraper.closeBrowser();
    return resultados;
  }
}