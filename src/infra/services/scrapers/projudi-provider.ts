// src/infra/services/scrapers/projudi-provider.ts
import { BaseScraper } from './base.scraper.js';
import { Page, Frame } from 'puppeteer';
import { analisarBuraco } from './captcha.solver.js';
import { PROJUDI_URLS } from './tribunal-loader.js';


const MAX_TENTATIVAS_CAPTCHA = 15;

// ============================================================================
// ESTRATÉGIAS DE SELETORES POR TRIBUNAL (O Canivete Suíço)
// ============================================================================
const PROJUDI_CONFIGS: Record<string, any> = {
  '8.05': { // TJBA 
    requerConsultaAvancada: true,
    seletorInput: 'input[name="numeroProcesso"]',
    seletorBtnBusca: 'input[name="Buscar"], input[src*="bot-submeter.gif"]',
    seletorLinkDetalhes: 'a[href*="DadosProcesso"]',
    seletorTabela: '#Arquivos table tr'
  },
  // '8.09': { // TJGO
  //   requerConsultaAvancada: false,
  //   seletorInput: '#ProcessoNumero, input[name="ProcessoNumero"]', 
  //   seletorBtnBusca: '#btnBuscar, input[value="Buscar"]',
  //   seletorLinkDetalhes: 'a[href*="DetalheProcesso"], a[href*="DadosProcesso"]',
  //   seletorTabela: '#Arquivos table tr, table.tabela_andamentos tr, .andamento table tr'
  // },
  // '8.18': { // TJPI
  //   requerConsultaAvancada: false,
  //   seletorInput: 'input[name="numeroProcesso"]',
  //   seletorBtnBusca: 'input[name="Buscar"], input[value="Pesquisar"]',
  //   seletorLinkDetalhes: 'a[href*="DadosProcesso"]',
  //   seletorTabela: '#Arquivos table tr, #Andamentos table tr'
  // },
  // '8.23': { // TJRR
  //   requerConsultaAvancada: false,
  //   seletorInput: 'input[name="numeroProcesso"], input[name="processo"]',
  //   seletorBtnBusca: 'input[name="Buscar"], button[type="submit"]',
  //   seletorLinkDetalhes: 'a[href*="DadosProcesso"]',
  //   seletorTabela: '#Arquivos table tr, table.table-striped tr'
  // },
  'DEFAULT': { // Fallback de segurança para estados não mapeados
    requerConsultaAvancada: false,
    seletorInput: 'input[name*="processo" i]',
    seletorBtnBusca: 'input[type="submit"], button',
    seletorLinkDetalhes: 'a[href*="Processo"]',
    seletorTabela: 'table tr'
  }
};

export class ProjudiProvider extends BaseScraper {

  private extrairChaveTribunal(numeroCNJ: string): string | null {
    const limpo = numeroCNJ.replace(/[^\d.]/g, '');
    const match = limpo.match(/\d{7}-?\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}/);
    return match ? `${match[1]}.${match[2]}` : null;
  }

  async consultar(numeroCNJ: string): Promise<any[] | null> {
    const chave = this.extrairChaveTribunal(numeroCNJ);

    if (!chave || !PROJUDI_URLS[chave]) {
      console.error(`❌ [PROJUDI] Tribunal ${chave} não suportado no mapeamento ou CNJ inválido.`);
      return null;
    }

    const config = PROJUDI_CONFIGS[chave] || PROJUDI_CONFIGS['DEFAULT'];
    const urlBusca = PROJUDI_URLS[chave];
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    await this.autenticarProxy(page).catch(() => { });

    try {
      console.log(`🔍 [PROJUDI ${chave}] Acessando portal: ${urlBusca}`);
      await page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(r => setTimeout(r, 5000));

      // 1. LÓGICA CONDICIONAL: Consulta Avançada
      if (config.requerConsultaAvancada) {
        console.log(`🖱️ [PROJUDI ${chave}] Clicando em "Consulta Avançada"...`);
        const linkHREF = "/projudi/interno.jsp?endereco=/projudi/buscas/ProcessosParte";

        let linkClicado = false;
        for (const frame of page.frames()) {
          const clicou = await frame.evaluate((href: any) => {
            const a = document.querySelector(`a[href*="${href}"]`) as HTMLElement;
            if (a) { a.click(); return true; }
            return false;
          }, linkHREF);
          if (clicou) { linkClicado = true; break; }
        }

        if (!linkClicado) console.warn(`⚠️ [PROJUDI ${chave}] Link "Consulta Avançada" não encontrado. Tentando seguir...`);
        await new Promise(r => setTimeout(r, 6000));
      }

      console.log(`✍️ [PROJUDI ${chave}] Inserindo CNJ: ${numeroCNJ}`);
      const numeroLimpo = numeroCNJ.replace(/[^\d]/g, '');
      const seletorInput = config.seletorInput;

      let targetFrame: Page | Frame = page;
      let achouInput = false;

      // 2. BUSCA DO INPUT EM TODOS OS FRAMES
      for (const f of page.frames()) {
        const input = await f.$(seletorInput);
        if (input) {
          targetFrame = f;
          await input.click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await input.type(numeroLimpo, { delay: 50 });
          achouInput = true;
          break;
        }
      }

      if (!achouInput) throw new Error(`Campo de número do processo (${seletorInput}) não localizado.`);      
      
     await new Promise(r => setTimeout(r, 1000));

      console.log(`🖱️ [PROJUDI ${chave}] Clicando no botão "Buscar"...`);
      const btnSeletor = config.seletorBtnBusca;

      const btnBuscar = await targetFrame.$(btnSeletor);
      if (!btnBuscar) {
        throw new Error(`Botão de busca (${btnSeletor}) não encontrado no frame.`);
      }

      await btnBuscar.click();
      await new Promise(r => setTimeout(r, 8000));

      // 3. O PITBULL - Resolve Tencent ou segue direto
      const resolveuCaptcha = await this.resolverTencentProjudi(page, chave);
      if (!resolveuCaptcha) return null;

      // ============================================================================
      // FASE 2: NAVEGAÇÃO NA LISTA DE RESULTADOS E EXTRAÇÃO
      // ============================================================================
      console.log(`⏳ [PROJUDI ${chave}] Aguardando a página de resultados carregar...`);
      await new Promise(r => setTimeout(r, 6000)); // Mudei de 600000 para 6000, senão vai travar por 10 minutos!

      let acessouDetalhes = false;
      const seletorLinkDetalhes = config.seletorLinkDetalhes;

      for (const f of page.frames()) {
        try {
          const linkProcesso = await f.$(seletorLinkDetalhes);
          if (linkProcesso) {
            console.log(`🖱️ [PROJUDI ${chave}] Link do processo encontrado! Clicando para abrir detalhes...`);
            await linkProcesso.click();
            acessouDetalhes = true;
            break;
          }
        } catch (e) { }
      }

      if (acessouDetalhes) {
        console.log(`⏳ [PROJUDI ${chave}] Aguardando o carregamento dos detalhes do processo...`);
        await new Promise(r => setTimeout(r, 8000));
      } else {
        console.log(`⚠️ [PROJUDI ${chave}] Link de detalhes não encontrado. O processo pode já estar aberto ou não existe.`);
      }

      // 4. EXTRAÇÃO DA TABELA (Usando seletor do estado)
      for (const f of page.frames()) {
        try {
          // Verifica se algum tr da tabela existe
          const temTabela = await f.$(config.seletorTabela);
          if (temTabela) {
            console.log(`✅ [PROJUDI ${chave}] Tabela de movimentações encontrada! Extraindo dados...`);
            const movs = await this.extrairMovimentacoes(f, config.seletorTabela);

            if (movs && movs.length > 0) {
              console.log(`🎉 SUCESSO ABSOLUTO! Foram extraídas ${movs.length} movimentações!`);
              console.log(`📄 Primeiras movimentações lidas do PROJUDI ${chave}:`, movs.slice(0, 2));
              return movs;
            }
          }
        } catch (e) { }
      }

      console.log(`⚠️ [PROJUDI ${chave}] Processo liberado, mas nenhuma tabela de movimentações válida foi encontrada.`);
      return [];

    } catch (error: any) {
      console.error(`❌ [PROJUDI ${chave}] Erro na consulta: ${error.message}`);
      return null;
    } finally {
      await page.close().catch(() => { });
    }
  }

  // ============================================================================
  // O "PITBULL": Visão Computacional Unificada + Efeito Overshoot
  // ============================================================================
  private async resolverTencentProjudi(page: Page, chave: string): Promise<boolean> {
    let tentativa = 1;
    let captchaResolvido = false;

    while (tentativa <= MAX_TENTATIVAS_CAPTCHA) {
      console.log(`👁️🤖 [PROJUDI ${chave}] Checando Captcha (Tentativa ${tentativa}/${MAX_TENTATIVAS_CAPTCHA})...`);

      let tencentFrame = null;
      try {
        let tencentIframeEl = null;
        for (const f of page.frames()) {
          try {
            const el = await f.$('iframe[id*="tcaptcha_iframe"], iframe[src*="tcaptcha"]');
            if (el) {
              tencentIframeEl = el;
              break;
            }
          } catch (e) { }
        }

        if (!tencentIframeEl) {
          console.log(`✅ [PROJUDI ${chave}] Captcha não detectado na tela (Formulário passou livre).`);
          captchaResolvido = true;
          break;
        }

        tencentFrame = await tencentIframeEl.contentFrame();
        if (!tencentFrame) throw new Error("Não foi possível acessar o iframe da Tencent.");

        console.log("⏳ Aguardando DOM do captcha estabilizar...");
        await tencentFrame.waitForSelector('#slideBg', { visible: true, timeout: 10000 });

        // 🔥 CORREÇÃO: O robô esperava só o Fundo (#slideBg). Agora ele espera a pecinha renderizar.
        // Isso impede o erro "Falha ao calcular posições" após o botão de reload ser clicado.
        await tencentFrame.waitForFunction(() => {
          const peca = document.querySelector('.tc-fg-item:not(.tc-slider-normal)');
          const slider = document.querySelector('.tc-slider-normal');
          return peca !== null && slider !== null;
        }, { timeout: 10000 });

        await new Promise(r => setTimeout(r, 1500)); // Fôlego para a imagem baixar 100%

        const infoPeca = await tencentFrame.evaluate(() => {
          const bg = document.querySelector('#slideBg');
          const peca = document.querySelector('.tc-fg-item:not(.tc-slider-normal)');
          if (!bg || !peca) return null;

          const bgRect = bg.getBoundingClientRect();
          const pecaRect = peca.getBoundingClientRect();

          return {
            bordaEsquerdaPecaX: pecaRect.left - bgRect.left,
            larguraPecaCSS: pecaRect.width,
            larguraBgCSS: bgRect.width
          };
        });

        if (!infoPeca) throw new Error("Falha ao calcular posições no HTML da Tencent.");

        await tencentFrame.evaluate(() => {
          document.querySelectorAll('.tc-fg-item').forEach(el => {
            (el as HTMLElement).style.setProperty('display', 'none', 'important');
          });
        });
        await new Promise(r => setTimeout(r, 500));

        const bgElement = await tencentFrame.$('#slideBg');
        const imageBuffer = await bgElement!.screenshot({ encoding: 'binary' }) as Buffer;

        await tencentFrame.evaluate(() => {
          document.querySelectorAll('.tc-fg-item').forEach(el => {
            (el as HTMLElement).style.removeProperty('display');
          });
        });

        const distanciaArraste = await analisarBuraco(
          imageBuffer,
          infoPeca.bordaEsquerdaPecaX,
          infoPeca.larguraPecaCSS,
          infoPeca.larguraBgCSS
        );

        if (!distanciaArraste || distanciaArraste < 10) {
          throw new Error("Cálculo da imagem falhou ou distância é muito curta.");
        }

        const sliderButton = await tencentFrame.$('.tc-slider-normal');
        if (!sliderButton) throw new Error("Botão slider não encontrado.");

        const box = await sliderButton.boundingBox();
        if (!box) throw new Error("Falha ao calcular coordenadas absolutas do slider.");

        const startX = box.x + (box.width / 2);
        const startY = box.y + (box.height / 2);
        const destinoX = startX + distanciaArraste;

        console.log(`🖱️ [PROJUDI ${chave}] Segurando a peça e iniciando o arraste...`);
        await page.mouse.move(startX, startY, { steps: 5 });
        await page.mouse.down();

        await new Promise(r => setTimeout(r, Math.random() * 200 + 100));

        let currentX = startX;
        const steps = Math.floor(Math.random() * 15) + 30;
        const stepX = distanciaArraste / steps;

        for (let i = 0; i < steps; i++) {
          currentX += stepX + (Math.random() * 2 - 1);
          const tremedeiraY = startY + (Math.random() * 3 - 1.5);
          const delay = i > steps * 0.8 ? Math.random() * 20 + 15 : Math.random() * 10 + 5;
          await page.mouse.move(currentX, tremedeiraY, { steps: 1 });
          await new Promise(r => setTimeout(r, delay));
        }

        const overshoot = Math.random() * 4 + 3;
        await page.mouse.move(destinoX + overshoot, startY + (Math.random() * 2 - 1), { steps: 3 });
        await new Promise(r => setTimeout(r, Math.random() * 150 + 100));

        await page.mouse.move(destinoX, startY, { steps: 4 });
        await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
        await page.mouse.up();

        console.log(`✅ [PROJUDI ${chave}] Arraste concluído com Micro-Correção! Cruzando os dedos...`);

        let captchaAindaVisivel: any = true;
        for (let wait = 0; wait < 10; wait++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            captchaAindaVisivel = await tencentFrame.evaluate(() => {
              const bg = document.querySelector('#slideBg');
              return bg && bg.getBoundingClientRect().width > 0;
            });
            if (!captchaAindaVisivel) {
              console.log(`🚀 [PROJUDI ${chave}] O frame do captcha fechou! Código aceito.`);
              break;
            }
          } catch (e: any) {
            if (e.message.includes('detached') || e.message.includes('destroyed') || e.message.includes('Execution context')) {
              console.log(`🚀 [PROJUDI ${chave}] A página recarregou! Captcha aceito.`);
              captchaAindaVisivel = false;
              break;
            }
          }
        }

        if (!captchaAindaVisivel) {
          console.log(`🎉 BINGO! A PEÇA ENCAIXOU NO PROJUDI!`);
          captchaResolvido = true;
          break;
        } else {
          console.warn(`⚠️ Bateu na trave. Atualizando imagem...`);
          try {
            const refreshBtn = await tencentFrame.$('#reload');
            if (refreshBtn) await refreshBtn.click();
          } catch (e) { }
          await new Promise(r => setTimeout(r, 4000)); // Mais tempo para recarregar
          throw new Error("Peça não encaixou.");
        }

      } catch (err: any) {
        if (err.message.includes('detached') || err.message.includes('destroyed') || err.message.includes('Execution context')) {
          console.log(`🚀 [PROJUDI ${chave}] A página recarregou bruscamente! Captcha aceito.`);
          captchaResolvido = true;
          break;
        }
        console.warn(`⚠️ [PROJUDI ${chave}] Falha na tentativa ${tentativa}: ${err.message}`);

        // 🔥 CORREÇÃO: Se o HTML quebrou ou deu timeout, forçamos o reload do captcha para limpar a sujeira.
        if (err.message.includes('HTML') || err.message.includes('waiting for function')) {
          try {
            if (tencentFrame) {
              const refreshBtn = await tencentFrame.$('#reload');
              if (refreshBtn) await refreshBtn.click();
            }
          } catch (e) { }
          await new Promise(r => setTimeout(r, 4000));
        }

        tentativa++;
      }
    }

    if (!captchaResolvido) {
      console.error(`❌ [PROJUDI ${chave}] Esgotou as tentativas de Captcha.`);
      return false;
    }

    return true;
  }

  // ============================================================================
  // EXTRAÇÃO DINÂMICA DE TABELAS
  // ============================================================================
  private async extrairMovimentacoes(contexto: Page | Frame, seletorTabela: string): Promise<any[]> {
    return contexto.evaluate((seletor) => {
      const movs: any[] = [];
      const rows = document.querySelectorAll(seletor);

      rows.forEach(r => {
        const cols = r.querySelectorAll('td');

        if (cols.length >= 3) {
          // O índice das colunas pode variar um pouco, mas a regex de data nos salva
          const textCols = Array.from(cols).map(c => c.textContent?.trim() || '');

          let dataText = '';
          let eventoText = '';

          textCols.forEach(texto => {
            if (/\d{2}\/\d{2}\/\d{2,4}/.test(texto)) dataText = texto;
            else if (texto.length > 5 && !/^\d+$/.test(texto)) eventoText += texto + ' ';
          });

          if (dataText && eventoText) {
            const tituloLimpo = eventoText.replace(/\s+/g, ' ').trim();

            movs.push({
              titulo: tituloLimpo.substring(0, 100),
              data: dataText,
              codigo: 999999,
              descricao: tituloLimpo
            });
          }
        }
      });
      return movs;
    }, seletorTabela);
  }
}