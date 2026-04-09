// src/services/scrapers/pje.provider.ts
import { BaseScraper } from './base.scraper.js';
import { Page } from 'puppeteer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { escutarChamadasGeeTest, resolverCaptchaAutomatico } from './captcha.solver.js';
import { PJE_URLS } from './tribunal-loader.js'; // ← lido do JSON

// const obterTribunalPorCNJ = (cnj: string) => {
//     const segmento = cnj.replace(/[^\d]/g, '').substring(13, 16); 
//     const mapaEstados: Record<string, string> = {
//         '801': 'TJAC', '802': 'TJAL', '803': 'TJAP', '804': 'TJAM', '805': 'TJBA',
//         '806': 'TJCE', '807': 'TJDFT', '808': 'TJES', '809': 'TJGO', '810': 'TJMA',
//         '811': 'TJMT', '812': 'TJMS', '813': 'TJMG', '814': 'TJPA', '815': 'TJPB',
//         '816': 'TJPR', '817': 'TJPE', '818': 'TJPI', '819': 'TJRJ', '820': 'TJRN',
//         '821': 'TJRS', '822': 'TJRO', '823': 'TJRR', '824': 'TJSC', '825': 'TJSE',
//         '826': 'TJSP', '827': 'TJTO'
//     };
//     return mapaEstados[segmento] || `Tribunal ${segmento}`;
// };

const obterTribunalPorCNJ = (cnj: string): string => {
  const segmento = cnj.replace(/[^\d]/g, '').substring(13, 16);
  return segmento === '805' ? 'TJBA' : `Tribunal ${segmento}`;
};

export interface PjeMovimentacao {
  titulo: string;
  descricao: string;
  data: string;
  codigo: number;
}

export interface PjeResultado {
  numeroProcesso: string;
  tribunal: string;
  orgaoJulgador: string;
  movimentacoes: PjeMovimentacao[];
  fonte: 'PJe';
}

async function salvarHtmlDebug(page: Page, chave: string): Promise<string> {
  const html = await page.content();
  const caminho = path.join(os.tmpdir(), `pje-debug-${chave}-${Date.now()}.html`);
  fs.writeFileSync(caminho, html, 'utf-8');
  return caminho;
}

export class PJeProvider extends BaseScraper {

  async consultar(numeroCNJ: string): Promise<PjeResultado | null> {
    const chave = this.extrairChaveTribunal(numeroCNJ);
    if (!chave || !PJE_URLS[chave]) {
      console.error(`❌ [PJe] Tribunal ${chave} não suportado ou CNJ inválido.`);
      return null;
    }
    return this.scrapeProcesso(numeroCNJ, PJE_URLS[chave], chave);
  }

  // Novo método para permitir a passagem de URL dinâmica via Roteador
  async consultarComUrl(numeroCNJ: string, url: string, chave: string): Promise<PjeResultado | null> {
    return this.scrapeProcesso(numeroCNJ, url, chave);
  }

  private extrairChaveTribunal(numeroCNJ: string): string | null {
    const limpo = numeroCNJ.replace(/[^\d.]/g, '');
    const match = limpo.match(/\d{7}-?\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}/);
    return match ? `${match[1]}.${match[2]}` : null;
  }

  private async scrapeProcesso(
    numeroCNJ: string,
    url: string,
    chave: string,
  ): Promise<PjeResultado | null> {

    const MAX_TENTATIVAS_PROCESSO = 5;

    for (let tentativaProcesso = 1; tentativaProcesso <= MAX_TENTATIVAS_PROCESSO; tentativaProcesso++) {

      if (tentativaProcesso > 1) {
        console.log(`\n🔄 [PJe ${chave}] REINICIANDO PROCESSO ${numeroCNJ} (Tentativa ${tentativaProcesso}/${MAX_TENTATIVAS_PROCESSO}) com novo IP...`);
      }

      const browser = await this.getBrowser();
      const page = await browser.newPage();

      try {
        await this.autenticarProxy(page);

        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        );

        await page.setRequestInterception(true);
        page.on('request', (req: any) => {
          if (['font', 'media'].includes(req.resourceType())) req.abort();
          else req.continue();
        });

        console.log(`🔍 [PJe ${chave}] Acessando: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        escutarChamadasGeeTest(page);

        await this.preencherBuscaPJe(page, numeroCNJ, chave);

        const btnPesquisar = await page.$(
          'input[id*="fPP:searchProcessos"], input[id*="botaoPesquisar"], ' +
          'input[type="submit"][value*="esquisar"], button[id*="pesquisar"]',
        );
        if (!btnPesquisar) {
          const caminho = await salvarHtmlDebug(page, chave);
          throw new Error(`Botão de pesquisa não encontrado. HTML salvo em: ${caminho}`);
        }

        await page.evaluate(() => {
          const w = window as any;
          w._callbackRoubado = null;

          if (w.TencentCaptcha) {
            const Original = w.TencentCaptcha;
            w.TencentCaptcha = function (appId: any, callback: any, opts: any) {
              w._callbackRoubado = callback;
              return new Original(appId, callback, opts);
            };
          }
        });
        
        try {
          const meuIpNoPuppeteer = await page.evaluate(async () => {
            const res = await fetch('https://api.ipify.org');
            return await res.text();
          });
          console.log(`🌍 [Proxy Check] O IP real da aba do Puppeteer é: ${meuIpNoPuppeteer}`);
        } catch {
          console.log(`🌍 [Proxy Check] Falha ao checar IP (Timeout ou bloqueio).`);
        }

        console.log(`🖱️  [PJe ${chave}] Clicando em Pesquisar...`);
        await btnPesquisar.click();

        const captchaOk = await resolverCaptchaAutomatico(page, chave);

        if (!captchaOk) {
          throw new Error('Captcha não resolvido ou rejeitado (Expirou).');
        }

        await page.waitForSelector(
          'table[id*="processoList"], .rich-table, .rich-datascrl-cnt, td[id*="listagem"], div[id*="mensagens"]',
          { timeout: 45000, visible: true }
        ).catch(() => console.warn(`⚠️ [PJe ${chave}] Timeout aguardando os elementos da tabela.`));

        console.log(`⏳ [PJe ${chave}] Tabela detectada! Aguardando estabilização dos dados...`);
        await new Promise(r => setTimeout(r, 5000));

        const textoPagina = await page.content();

        if (textoPagina.includes('Ocorreu um erro inesperado') || textoPagina.includes('erro interno')) {
          throw new Error('O servidor do Tribunal retornou um erro interno ao buscar o processo.');
        }

        if (
          textoPagina.includes('Nenhum resultado encontrado') ||
          textoPagina.includes('nenhum processo encontrado') ||
          textoPagina.includes('nenhum processo disponível') 
        ) {
          console.log(`ℹ️ [PJe ${chave}] Processo ${numeroCNJ} não pertence ao PJe (Mensagem vermelha detectada).`);
          return null;
        }

        console.log(`🔗 [PJe ${chave}] Localizando link com openPopUp para o processo ${numeroCNJ}...`);
        const paginasAntes = await browser.pages();

        const clicouComSucesso = await page.evaluate((numeroOriginal: string) => {
          const numLimpo = numeroOriginal.replace(/[^\d]/g, '');
          const links = Array.from(document.querySelectorAll('a[onclick*="openPopUp"]'));

          let alvo: HTMLElement | null | undefined = links.find(a => {
            const texto = (a.textContent || '').replace(/[^\d]/g, '');
            return texto.includes(numLimpo) && numLimpo.length > 10;
          }) as HTMLElement | undefined;

          if (!alvo) {
            alvo = links.find(a => a.getAttribute('title')?.toLowerCase().includes('detalhe')) as HTMLElement | undefined;
          }

          if (alvo) {
            alvo.click();
            return true;
          }
          return false;
        }, numeroCNJ);

        if (clicouComSucesso) {
          console.log(`🚀 [PJe ${chave}] Clique disparado. Aguardando a aba do Pop-up abrir...`);

          let novaPagina: Page | null = null;
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const paginasDepois = await browser.pages();
            if (paginasDepois.length > paginasAntes.length) {
              novaPagina = paginasDepois[paginasDepois.length - 1];
              break;
            }
          }

          if (!novaPagina) {
            throw new Error('O Pop-up de detalhes não abriu a tempo.');
          }

          console.log(`📑 [PJe ${chave}] Pop-up detectado! Aguardando o Tribunal carregar a tabela de movimentações...`);

          await new Promise(r => setTimeout(r, 5000));

          try {
            await novaPagina.waitForSelector(
              'table, .timeline-item, tbody, tr.rich-table-row',
              { visible: true, timeout: 25000 }
            );
            await new Promise(r => setTimeout(r, 2000));
          } catch (e) {
            console.warn(`⚠️ [PJe] A tabela demorou muito para aparecer no pop-up. Tentando extrair mesmo assim...`);
          }

          console.log(`✅ [PJe ${chave}] Dados carregados no Pop-up! Iniciando extração...`);
          const dados = await this.extrairDados(novaPagina, numeroCNJ, chave);

          console.log(`🎉 SUCESSO ABSOLUTO! Foram extraídas ${dados.movimentacoes.length} movimentações do PJe!`);

          if (dados.movimentacoes.length === 0) {
            const caminhoPopup = await salvarHtmlDebug(novaPagina, `${chave}-popup-vazio`);
            console.warn(`⚠️ [PJe] Pop-up abriu mas movimentações vieram vazias! HTML salvo em: ${caminhoPopup}`);
          }

          await novaPagina.close().catch(() => { });
          return dados;
        } else {
          console.warn(`⚠️ [PJe ${chave}] Link 'openPopUp' não encontrado. Extraindo da página principal.`);
          const dadosFallback = await this.extrairDados(page, numeroCNJ, chave);

          if (dadosFallback.movimentacoes.length === 0) {
            const caminhoPrincipal = await salvarHtmlDebug(page, `${chave}-principal-vazia`);
            console.warn(`⚠️ [PJe] Extração da tela principal voltou vazia! HTML salvo em: ${caminhoPrincipal}`);
          }

          return dadosFallback; 
        }

      } catch (err: any) {
        console.warn(`⚠️ [PJe ${chave}] Erro na tentativa ${tentativaProcesso}: ${err.message}`);

        if (tentativaProcesso === MAX_TENTATIVAS_PROCESSO) {
          console.error(`❌ [PJe ${chave}] Esgotadas as tentativas para o processo ${numeroCNJ}.`);
          return null;
        }
      } finally {
        await page.close().catch(() => { });
      }
    }

    return null;
  }

  private async preencherBuscaPJe(page: Page, numeroCNJ: string, chave: string): Promise<void> {
    const radiosEncontrados: any = await page.$$eval('input[type="radio"]', els =>
      els.map(el => ({
        id: el.id,
        name: (el as HTMLInputElement).name,
        value: (el as HTMLInputElement).value,
        checked: (el as HTMLInputElement).checked,
      })),
    );
    console.log(`🔎 [PJe ${chave}] Radios:`, JSON.stringify(radiosEncontrados));

    const seletoresRadio = [
      'input[id*="radioNumeroUnico"]',
      'input[id*="numeracaoUnica"]',
      'input[id*="numProcesso:tipo"][value="N"]',
      'input[name*="tipoNumeracao"][value="UNICA"]',
      'input[type="radio"][value="N"]',
      'input[type="radio"][value="UNICO"]',
      'input[type="radio"][value="NUMERACAO_UNICA"]',
    ];

    let radioClicado = false;
    for (const sel of seletoresRadio) {
      const radio = await page.$(sel);
      if (radio) {
        const marcado = await page.$eval(sel, el => (el as HTMLInputElement).checked);
        if (!marcado) {
          await radio.click();
          await new Promise(r => setTimeout(r, 800));
          console.log(`☑️  [PJe ${chave}] Radio clicado: ${sel}`);
        } else {
          console.log(`☑️  [PJe ${chave}] Radio já marcado: ${sel}`);
        }
        radioClicado = true;
        break;
      }
    }

    if (!radioClicado && radiosEncontrados.length > 0) {
      const primeiroId = radiosEncontrados[0].id;
      if (primeiroId) {
        await page.click(`#${CSS.escape(primeiroId)}`);
        await new Promise(r => setTimeout(r, 800));
        console.warn(`⚠️  [PJe ${chave}] Clicou no primeiro radio: #${primeiroId}`);
        radioClicado = true;
      }
    }

    if (!radioClicado) {
      console.warn(`⚠️  [PJe ${chave}] Nenhum radio encontrado — tentando preencher direto.`);
    }

    const inputsEncontrados = await page.$$eval('input[type="text"], input:not([type])', els =>
      els.map(el => ({
        id: el.id,
        name: (el as HTMLInputElement).name,
        placeholder: (el as HTMLInputElement).placeholder,
        visible: (el as HTMLElement).offsetParent !== null,
      })),
    );
    console.log(`🔎 [PJe ${chave}] Inputs:`, JSON.stringify(inputsEncontrados));

    const seletoresInput = [
      'input[id*="fPP:numProcesso:NumeroOrgaoJusticaDecoration:NumeroOrgaoJustica"]',
      'input[id*="numProcesso:NumeroOrgaoJustica"]',
      'input[id$=":numeroProcesso"]',
      'input[name*="numeroProcesso"]',
      'input[id*="processoNumeroCNJ"]',
      'input[id*="numProcesso"]',
    ];

    let seletorEncontrado: string | null = null;
    for (const seletor of seletoresInput) {
      try {
        await page.waitForSelector(seletor, { timeout: 3000 });
        seletorEncontrado = seletor;
        console.log(`🎯 [PJe ${chave}] Campo encontrado: ${seletor}`);
        break;
      } catch { /* tenta o próximo */ }
    }

    if (!seletorEncontrado) {
      const caminho = await salvarHtmlDebug(page, chave);
      throw new Error(`[PJe ${chave}] Campo não encontrado. HTML salvo em: ${caminho}`);
    }

    await page.$eval(seletorEncontrado, el => { (el as HTMLInputElement).value = ''; });
    await page.click(seletorEncontrado, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    const apenasDigitos = numeroCNJ.replace(/[^\d]/g, '');
    await page.type(seletorEncontrado, apenasDigitos, { delay: 40 });
    console.log(`✍️  [PJe ${chave}] Número preenchido: ${apenasDigitos}`);
  }

  private async extrairDados(page: Page, numeroCNJ: string, chave: string): Promise<PjeResultado> {
    const dados = await page.evaluate(() => {
      const movs: any[] = [];
      let orgao = "Não informado";

      const spans = Array.from(document.querySelectorAll('span, div, td'));
      const divOrgao = spans.find(el => el.textContent?.includes('Órgão Julgador'));
      if (divOrgao && divOrgao.nextElementSibling) {
         orgao = divOrgao.nextElementSibling.textContent?.trim() || "Não informado";
      }

      const tbodyMovimentacoes = document.querySelector('tbody[id$=":processoEvento:tb"]');
      
      if (tbodyMovimentacoes) {
        const linhas = tbodyMovimentacoes.querySelectorAll('tr.rich-table-row');
        
        linhas.forEach(linha => {
          const textoCompleto = linha.textContent?.trim().replace(/\s+/g, ' ') || '';

          const regexData = /^(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s*-\s*(.*)/;
          const match : any = textoCompleto.match(regexData);

          if (match) {
            movs.push({
              data: match[1].trim(), 
              titulo: match[2].substring(0, 100), 
              descricao: match[2].trim(),
              codigo: 999999
            });
          }
        });
      }

      return {
        orgaoJulgador: orgao,
        movimentacoes: movs
      };
    });

    return {
      numeroProcesso: numeroCNJ,
      tribunal: obterTribunalPorCNJ(numeroCNJ),
      fonte: 'PJe',
      orgaoJulgador: dados.orgaoJulgador,
      movimentacoes: dados.movimentacoes
    };
  }
}