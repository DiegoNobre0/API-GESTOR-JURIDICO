// src/services/scrapers/tribunal-router.ts
import { PJeProvider, type PjeResultado } from './pje-provider.js';
import { prisma } from '@/lib/prisma.js';
import { ProjudiProvider } from './projudi-provider.js';
import { EsajProvider } from './esaj.provider.js';

export type SistemaOrigem = 'PJe' | 'PROJUDI' | 'eSAJ' | 'eproc' | string;

export interface MovimentacaoNormalizada {
    titulo: string;
    descricao: string;
    data: string;
    codigo: number;
}

export interface ResultadoRoteador {
    sistemaOrigem: SistemaOrigem;
    movimentacoes: MovimentacaoNormalizada[];
    tribunal: string;
    orgaoJulgador: string;
}

interface ConfigTribunal {
    nome: string;
    sistemas: SistemaOrigem[];
}

// const CONFIG_TRIBUNAIS: Record<string, ConfigTribunal> = {
//   // 🟢 NORTE
//   '8.01': { nome: 'TJAC', sistemas: ['eSAJ'] },
//   '8.03': { nome: 'TJAP', sistemas: ['PJe'] },
//   '8.04': { nome: 'TJAM', sistemas: ['eSAJ', 'PJe'] },
//   '8.14': { nome: 'TJPA', sistemas: ['PJe'] },
//   '8.22': { nome: 'TJRO', sistemas: ['PJe'] },
//   '8.23': { nome: 'TJRR', sistemas: ['PJe', 'PROJUDI'] },
//   '8.27': { nome: 'TJTO', sistemas: ['eproc'] },

//   // 🟡 NORDESTE
//   '8.02': { nome: 'TJAL', sistemas: ['eSAJ'] },
//   '8.05': { nome: 'TJBA', sistemas: ['PJe', 'PROJUDI'] },
//   '8.06': { nome: 'TJCE', sistemas: ['PJe', 'eSAJ'] },
//   '8.10': { nome: 'TJMA', sistemas: ['PJe'] },
//   '8.15': { nome: 'TJPB', sistemas: ['PJe'] },
//   '8.17': { nome: 'TJPE', sistemas: ['PJe'] },
//   '8.18': { nome: 'TJPI', sistemas: ['PROJUDI'] },
//   '8.20': { nome: 'TJRN', sistemas: ['PJe'] },
//   '8.25': { nome: 'TJSE', sistemas: ['eproc'] },

//   // 🔵 CENTRO-OESTE
//   '8.07': { nome: 'TJDFT', sistemas: ['PJe'] },
//   '8.09': { nome: 'TJGO', sistemas: ['PROJUDI', 'PJe'] },
//   '8.11': { nome: 'TJMT', sistemas: ['PJe'] },
//   '8.12': { nome: 'TJMS', sistemas: ['eSAJ'] },

//   // 🟣 SUDESTE
//   '8.08': { nome: 'TJES', sistemas: ['PJe'] },
//   '8.13': { nome: 'TJMG', sistemas: ['PJe'] },
//   '8.19': { nome: 'TJRJ', sistemas: ['PJe'] },
//   '8.26': { nome: 'TJSP', sistemas: ['eSAJ'] },

//   // 🔴 SUL
//   '8.16': { nome: 'TJPR', sistemas: ['PROJUDI', 'PJe'] },
//   '8.21': { nome: 'TJRS', sistemas: ['eproc'] },
//   '8.24': { nome: 'TJSC', sistemas: ['eproc'] },
// };

const CONFIG_TRIBUNAIS: Record<string, ConfigTribunal> = {
  '8.05': { nome: 'TJBA', sistemas: ['PJe', 'PROJUDI'] },
};

const pje     = new PJeProvider();
const projudi = new ProjudiProvider();
const esaj    = new EsajProvider();

function extrairSegmento(cnj: string): string | null {
    const limpo = cnj.replace(/[^\d]/g, '');
    if (limpo.length !== 20) return null;
    const j  = limpo.substring(13, 14);
    const tr = limpo.substring(14, 16);
    return `${j}.${tr}`;
}

// ── Executores internos (router de produção) ──────────────────────────────────

async function tentarPJe(cnj: string): Promise<ResultadoRoteador | null> {
    const resultado: any = await pje.consultar(cnj);
    if (!resultado || resultado.movimentacoes.length === 0) return null;
    return {
        sistemaOrigem: 'PJe',
        tribunal: resultado.tribunal,
        orgaoJulgador: resultado.orgaoJulgador,
        movimentacoes: resultado.movimentacoes.map((m: any) => ({
            titulo: m.titulo, descricao: m.descricao, data: m.data, codigo: m.codigo,
        })),
    };
}

async function tentarPROJUDI(cnj: string): Promise<ResultadoRoteador | null> {
    const resultado: any = await projudi.consultar(cnj);
    if (!resultado || resultado.length === 0) return null;
    const segmento = extrairSegmento(cnj);
    const config   = segmento ? CONFIG_TRIBUNAIS[segmento] : null;
    return {
        sistemaOrigem: 'PROJUDI',
        tribunal: config?.nome ?? 'Desconhecido',
        orgaoJulgador: 'PROJUDI',
        movimentacoes: resultado.map((m: any) => ({
            titulo:   m.titulo   ?? m.descricao ?? '',
            descricao: m.descricao ?? '',
            data:     m.data     ?? '',
            codigo:   m.codigo   ?? 999999,
        })),
    };
}

async function tentarESAJ(cnj: string): Promise<ResultadoRoteador | null> {
    const resultado = await esaj.consultar(cnj);
    if (!resultado || resultado.movimentacoes.length === 0) return null;
    return {
        sistemaOrigem: 'eSAJ',
        tribunal: resultado.tribunal,
        orgaoJulgador: resultado.orgaoJulgador,
        movimentacoes: resultado.movimentacoes.map((m: any) => ({
            titulo: m.titulo, descricao: m.descricao, data: m.data, codigo: m.codigo,
        })),
    };
}

const EXECUTORES: Record<string, (cnj: string) => Promise<ResultadoRoteador | null>> = {
    PJe:     tentarPJe,
    PROJUDI: tentarPROJUDI,
    eSAJ:    tentarESAJ,
    eproc:   async () => { console.warn('⚠️  [Router] eProc ainda não implementado.');  return null; },
};

// ── Roteador de PRODUÇÃO ──────────────────────────────────────────────────────

export async function rotearConsulta(
    cnj: string,
    processoId: string,
    cacheOrigem?: string | null,
): Promise<ResultadoRoteador | null> {

    // Guard 1: CNJ precisa ter 20 dígitos
    const segmento = extrairSegmento(cnj);
    if (!segmento) {
        console.error(`❌ [Router] CNJ inválido (${cnj.replace(/[^\d]/g, '').length} dígitos): ${cnj}`);
        return null;
    }

    // Guard 2: Só TJBA por enquanto
    if (segmento !== '8.05') {
        console.warn(`⚠️  [Router] Tribunal ${segmento} fora do escopo (apenas TJBA/8.05).`);
        return null;
    }

    // ── ROTA RÁPIDA: sistemaOrigem já conhecido ──────────────────────────────
    if (cacheOrigem === 'PJe') {
        console.log(`🗂️  [Router] ${cnj} → PJe (cache). Indo direto...`);
        return await tentarPJe(cnj);
    }

    if (cacheOrigem === 'PROJUDI') {
        console.log(`🗂️  [Router] ${cnj} → PROJUDI (cache). Indo direto...`);
        return await tentarPROJUDI(cnj);
    }

    // ── DESCOBERTA: sistemaOrigem vazio — testa PJe primeiro, depois PROJUDI ─
    console.log(`🔍 [Router] ${cnj} sem origem definida. Testando PJe...`);
    const resultadoPJe = await tentarPJe(cnj);
    if (resultadoPJe) {
        await salvarSistemaOrigem(processoId, 'PJe');
        return resultadoPJe;
    }

    console.log(`ℹ️  [Router] Não encontrado no PJe. Tentando PROJUDI...`);
    const resultadoProjudi = await tentarPROJUDI(cnj);
    if (resultadoProjudi) {
        await salvarSistemaOrigem(processoId, 'PROJUDI');
        return resultadoProjudi;
    }

    console.error(`❌ [Router] ${cnj} não localizado em nenhum sistema do TJBA.`);
    return null;
}

// ── Roteador de TESTE (lê URL explícita do dados.json) ───────────────────────
//
// Chamado pelo ProcessRunner.testarDados().
// Recebe a URL já resolvida pelo dados.json — útil pois alguns tribunais
// têm URLs diferentes das que estão no tribunais.json (1g vs 2g, subdomínios etc).

export async function rotearComUrl(
    cnj: string,
    sistema: SistemaOrigem,
    url: string,
): Promise<ResultadoRoteador | null> {

    const segmento = extrairSegmento(cnj);
    const config   = segmento ? CONFIG_TRIBUNAIS[segmento] : null;
    const chave    = segmento ?? '?';

    console.log(`🧪 [Router-Teste] ${sistema} | ${cnj} | ${url}`);

    if (sistema === 'PJe') {
        const resultado: any = await pje.consultarComUrl(cnj, url, chave);
        if (!resultado || resultado.movimentacoes.length === 0) return null;
        return {
            sistemaOrigem: 'PJe',
            tribunal: resultado.tribunal,
            orgaoJulgador: resultado.orgaoJulgador,
            movimentacoes: resultado.movimentacoes.map((m: any) => ({
                titulo: m.titulo, descricao: m.descricao, data: m.data, codigo: m.codigo,
            })),
        };
    }

    if (sistema === 'Projudi') {
        // O PROJUDI usa a URL internamente via PROJUDI_URLS; consultar() já lida com isso.
        // Passamos direto — se o código do tribunal não estiver no mapa, adicione no tribunais.json.
        const resultado: any = await projudi.consultar(cnj);
        if (!resultado || resultado.length === 0) return null;
        return {
            sistemaOrigem: 'PROJUDI',
            tribunal: config?.nome ?? 'Desconhecido',
            orgaoJulgador: 'PROJUDI',
            movimentacoes: resultado.map((m: any) => ({
                titulo: m.titulo ?? m.descricao ?? '', descricao: m.descricao ?? '',
                data: m.data ?? '', codigo: m.codigo ?? 999999,
            })),
        };
    }

    if (sistema === 'eSAJ') {
        const resultado: any = await esaj.consultarComUrl(cnj, url, chave);
        if (!resultado || resultado.movimentacoes.length === 0) return null;
        return {
            sistemaOrigem: 'eSAJ',
            tribunal: resultado.tribunal,
            orgaoJulgador: resultado.orgaoJulgador,
            movimentacoes: resultado.movimentacoes.map((m: any) => ({
                titulo: m.titulo, descricao: m.descricao, data: m.data, codigo: m.codigo,
            })),
        };
    }

    console.warn(`⚠️  [Router-Teste] Sistema "${sistema}" ainda não tem executor de teste.`);
    return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function salvarSistemaOrigem(processoId: string, sistema: SistemaOrigem): Promise<void> {
    try {
        await prisma.processo.update({
            where: { id: processoId },
            data: { sistemaOrigem: sistema },
        });
        console.log(`💾 [DB] sistemaOrigem de ${processoId} → ${sistema}`);
    } catch (err: any) {
        console.warn(`⚠️  [DB] Erro ao salvar sistemaOrigem: ${err.message}`);
    }
}