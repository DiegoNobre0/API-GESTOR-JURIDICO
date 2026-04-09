// src/services/scrapers/tribunal-loader.ts
//
// Lê o tribunais.json e exporta os mapas de URLs usados pelos providers.
// Para tribunais com graus separados (1g / 2g), usa '1g' como padrão —
// quando você for testar um tribunal específico é só passar a URL diretamente
// via consultarComUrl() em vez de depender do mapa.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const _filename = typeof __filename !== 'undefined' 
  ? __filename 
  : fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Ajuste o caminho se o JSON estiver em outro lugar (ex: '../../../tribunais.json')
const raw  = readFileSync(join(__dirname, 'tribunais.json'), 'utf-8');
const data = JSON.parse(raw) as TribunaisJson;

// ── Tipos internos ────────────────────────────────────────────────────────────
interface TribunalEntry {
  tribunal: string;
  codigo: string;
  url?: string;
  urls?: { '1g'?: string; '2g'?: string };
}

interface TribunaisJson {
  PJe:     { estadual: TribunalEntry[]; federal: TribunalEntry[]; trabalhista: TribunalEntry[] };
  Projudi: { estadual: TribunalEntry[] };
  eSAJ:    { estadual: TribunalEntry[] };
  eproc:   { estadual: TribunalEntry[]; federal: TribunalEntry[] };
}

// ── Helper: resolve a URL mais adequada de uma entrada ───────────────────────
// Entradas com graus: usa '1g'. Se quiser '2g', chame getUrlGrau() abaixo.
function resolveUrl(entry: TribunalEntry): string {
  if (entry.url)  return entry.url;
  if (entry.urls) return entry.urls['1g'] ?? entry.urls['2g'] ?? '';
  return '';
}

// ── Mapas exportados ──────────────────────────────────────────────────────────

/**
 * PJE_URLS — código do tribunal → URL padrão (1g quando existir graus).
 * Inclui estadual + federal. Trabalhista omitido pois os TRTs
 * têm fluxo diferente (sem captcha Tencent/GeeTest por enquanto).
 */
export const PJE_URLS: Record<string, string> = Object.fromEntries(
  [...data.PJe.estadual, ...data.PJe.federal]
    .map(e => [e.codigo, resolveUrl(e)])
    .filter(([, url]) => url !== ''),
);

/**
 * PROJUDI_URLS — código do tribunal → URL do PROJUDI.
 */
export const PROJUDI_URLS: Record<string, string> = Object.fromEntries(
  data.Projudi.estadual
    .map(e => [e.codigo, resolveUrl(e)])
    .filter(([, url]) => url !== ''),
);

/**
 * ESAJ_URLS — código do tribunal → URL padrão do eSAJ (1g).
 */
export const ESAJ_URLS: Record<string, string> = Object.fromEntries(
  data.eSAJ.estadual
    .map(e => [e.codigo, resolveUrl(e)])
    .filter(([, url]) => url !== ''),
);

/**
 * EPROC_URLS — código do tribunal → URL padrão do eProc (1g).
 */
export const EPROC_URLS: Record<string, string> = Object.fromEntries(
  [...data.eproc.estadual, ...data.eproc.federal]
    .map(e => [e.codigo, resolveUrl(e)])
    .filter(([, url]) => url !== ''),
);

// ── Utilitário para quem precisar de graus explícitos ────────────────────────
type Sistema = 'PJe' | 'Projudi' | 'eSAJ' | 'eproc';
type Grau = '1g' | '2g';

/**
 * Retorna a URL de um tribunal para um sistema e grau específicos.
 *
 * @example
 * getUrlGrau('8.17', 'PJe', '2g')
 * // → 'https://pje.cloud.tjpe.jus.br/2g/ConsultaPublica/listView.seam'
 */
export function getUrlGrau(codigo: string, sistema: Sistema, grau: Grau): string | null {
  const grupos: any[] = {
    PJe:     [...data.PJe.estadual,   ...data.PJe.federal],
    Projudi: [...data.Projudi.estadual],
    eSAJ:    [...data.eSAJ.estadual],
    eproc:   [...data.eproc.estadual, ...data.eproc.federal],
  }[sistema];

  const entry : any= grupos.find((e:any) => e.codigo === codigo);
  if (!entry) return null;

  if (entry.url)  return entry.url;
  if (entry.urls) return entry.urls[grau] ?? null;
  return null;
}
