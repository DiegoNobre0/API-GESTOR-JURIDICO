// src/infra/services/scrapers/esaj-provider.ts
import { BaseScraper } from './base.scraper.js';
import { Page } from 'puppeteer';
import { ESAJ_URLS } from './tribunal-loader.js';

export interface EsajResultado {
    numeroProcesso: string;
    tribunal: string;
    orgaoJulgador: string;
    movimentacoes: any[];
    fonte: string;
}

export class EsajProvider extends BaseScraper {
    private extrairChaveTribunal(numeroCNJ: string): string | null {
        const limpo = numeroCNJ.replace(/[^\d.]/g, '');
        const match = limpo.match(/\d{7}-?\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}/);
        return match ? `${match[1]}.${match[2]}` : null;
    }

    async consultar(numeroCNJ: string): Promise<EsajResultado | null> {
        const chave = this.extrairChaveTribunal(numeroCNJ);
        
        if (!chave || !ESAJ_URLS[chave]) {
            console.error(`❌ [eSAJ] Tribunal ${chave} não suportado no mapeamento ou CNJ inválido.`);
            return null;
        }

        const urlBusca = ESAJ_URLS[chave];
        return this.scrapeProcesso(numeroCNJ, urlBusca, chave);
    }

    // Método para permitir a passagem de URL dinâmica via Roteador de Testes
    async consultarComUrl(numeroCNJ: string, url: string, chave: string): Promise<EsajResultado | null> {
        return this.scrapeProcesso(numeroCNJ, url, chave);
    }

    private async scrapeProcesso(numeroCNJ: string, url: string, chave: string): Promise<EsajResultado | null> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        const MAX_TENTATIVAS_CAPTCHA = 5;

        try {
            await this.autenticarProxy(page);
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

            // Bloqueia imagens/fontes para poupar banda (menos a do Captcha!)
            await page.setRequestInterception(true);
            page.on('request', (req: any) => {
                const resourceType = req.resourceType();
                // Deixamos 'image' passar porque precisamos do #imagemCaptcha
                if (['font', 'media'].includes(resourceType)) req.abort();
                else req.continue();
            });

            console.log(`🔍 [eSAJ ${chave}] Acessando: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

            // 1. Garante que a busca é por CNJ
            const temComboPesquisa = await page.$('#cbPesquisa');
            if (temComboPesquisa) {
                await page.select('#cbPesquisa', 'NUMPROC');
                await new Promise(r => setTimeout(r, 800)); // Mais tempo para o eSAJ processar o select
            }

            // Seleciona explicitamente o rádio "Unificado" se existir
            try {
                const radioUnificado = await page.$('input[name="tipoNumero"][value="UNIFICADO"]');
                if (radioUnificado) {
                    await radioUnificado.click();
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (e) { /* Ignora se o rádio não existir neste tribunal */ }

            console.log(`✍️  [eSAJ ${chave}] Inserindo CNJ: ${numeroCNJ}`);
            
            // 2. Preenchimento Inteligente (Múltiplos layouts do eSAJ)
            const cnjLimpo = numeroCNJ.replace(/[^\d]/g, '');
            const inputForo = await page.$('#foroNumeroUnificado, input[name="foroNumeroUnificado"]');
            
            if (inputForo) {
                // Layout 2: Caixa separada para o Foro (SP, MS)
                // Extrai as partes do CNJ: 16 primeiros dígitos na caixa 1, 4 últimos na caixa 2
                const partePrincipal = cnjLimpo.substring(0, 16); 
                const foroOrgao = cnjLimpo.substring(16, 20);    
                
                const seletorParte1 = '#numeroDigitoAnoUnificado, input[name="numeroProcesso"]';
                await page.$eval(seletorParte1, (el: any) => el.value = '').catch(() => {});
                await page.type(seletorParte1, partePrincipal, { delay: 40 });
                
                await page.$eval('#foroNumeroUnificado, input[name="foroNumeroUnificado"]', (el: any) => el.value = '').catch(() => {});
                await page.type('#foroNumeroUnificado, input[name="foroNumeroUnificado"]', foroOrgao, { delay: 40 });
            } else {
                // Layout 1: Caixa única mas formatada (Alguns TJs)
                const seletorUnico = '#numeroDigitoAnoUnificado, #numeroProcesso, input[name="numeroProcesso"]';
                await page.$eval(seletorUnico, (el: any) => el.value = '').catch(() => {});
                await page.type(seletorUnico, cnjLimpo, { delay: 40 });
            }

            // 3. Clica em Pesquisar e Lida com o reCAPTCHA Invisível
            console.log(`🖱️  [eSAJ ${chave}] Preparando para Consultar...`);

            // Pausa estratégica para o reCAPTCHA v3 gerar o token em background
            await new Promise(r => setTimeout(r, 3000)); 

            const seletoresBotao = [
                '#botaoConsultarProcesso', 
                'input[name="pbEnviar"]', 
                '#pbEnviar', 
                'input[type="submit"][value*="onsultar"]',
                '.btn-consultar'
            ];

            let maxTentativasRecaptcha = 4;
            let tentativaAtual = 0;
            let passouDoRecaptchaInvisivel = false;

            while (tentativaAtual < maxTentativasRecaptcha && !passouDoRecaptchaInvisivel) {
                let botaoClicado = false;
                for (const seletor of seletoresBotao) {
                    const btn = await page.$(seletor);
                    if (btn) {
                        // Clica e já espera a página carregar (Navegação) ao mesmo tempo!
                        const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
                        await btn.click();
                        await navPromise; // Segura o robô até o recarregamento terminar
                        
                        botaoClicado = true;
                        console.log(`✅  [eSAJ ${chave}] Botão de busca clicado (Tentativa ${tentativaAtual + 1}/${maxTentativasRecaptcha}).`);
                        break;
                    }
                }

                // Se o botão não existe mais, é porque a página já mudou para os resultados ou captcha!
                if (!botaoClicado) {
                    console.log(`➡️  [eSAJ ${chave}] O botão 'Consultar' sumiu da tela. Assumindo que a página avançou!`);
                    passouDoRecaptchaInvisivel = true;
                    break;
                }

                // Verifica o que está na nova tela renderizada
                const textoPagina = await page.evaluate(() => document.body.innerText || "");
                
                if (textoPagina.includes('protegida por reCAPTCHA e ocorreu um problema') || textoPagina.includes('Aguarde alguns segundos')) {
                    console.warn(`⚠️  [eSAJ ${chave}] Barrado pelo reCAPTCHA invisível. Aguardando 4s...`);
                    await new Promise(r => setTimeout(r, 4000));
                    tentativaAtual++;
                } else {
                    // Não tem mensagem de erro, então passou direto!
                    passouDoRecaptchaInvisivel = true;
                }
            }

            if (!passouDoRecaptchaInvisivel) {
                throw new Error("Falha ao superar o reCAPTCHA invisível após múltiplas tentativas.");
            }

            // 4. Aguarda o resultado da tela (Detalhes, Lista, Erro ou Captcha) - Fôlego extra caso precise
            await page.waitForSelector(
                '#tabelaTodasMovimentacoes, #tabelaUltimasMovimentacoes, #mensagemRetorno, #imagemCaptcha, .senhaProcesso',
                { timeout: 30000, visible: true }
            ).catch(() => {});

            // ==========================================
            // LOOP DE CAPTCHA (OCR com Tesseract)
            // ==========================================
            let tentativaCaptcha = 1;
            let captchaResolvido = false;

            while (tentativaCaptcha <= MAX_TENTATIVAS_CAPTCHA) {
                const precisaCaptcha = await page.$('#imagemCaptcha');
                if (!precisaCaptcha) {
                    captchaResolvido = true;
                    break; // Passou direto ou já resolveu!
                }

                console.log(`🧩 [eSAJ ${chave}] Captcha de Imagem detectado! OCR rodando (Tentativa ${tentativaCaptcha})...`);

                const buffer = await precisaCaptcha.screenshot({ encoding: 'binary' }) as Buffer;

                // O seu método mágico do Tesseract entra em ação aqui
                const textoCaptcha = await this.processarCaptcha(buffer);
                console.log(`🤖 [Tesseract] Texto extraído: "${textoCaptcha}"`);

                if (textoCaptcha.length >= 4) {
                    await page.$eval('#codigoCaptcha', (el: any) => el.value = '');
                    await page.type('#codigoCaptcha', textoCaptcha, { delay: 50 });
                    await page.click('#botaoConsultarProcesso, #pbEnviar');

                    await new Promise(r => setTimeout(r, 4000));

                    const msgErroCaptcha = await page.evaluate(() => {
                        const erro = document.querySelector('#mensagemRetorno');
                        return erro ? erro.textContent?.toLowerCase() : '';
                    });

                    if (msgErroCaptcha?.includes('texto da imagem inválido') || msgErroCaptcha?.includes('código informado')) {
                        console.warn('⚠️  [eSAJ] OCR errou. Tentando novamente...');
                        tentativaCaptcha++;
                    } else {
                        console.log('✅ [eSAJ] Captcha aceito pelo servidor!');
                        captchaResolvido = true;
                        break;
                    }
                } else {
                    console.warn('⚠️  [eSAJ] Tesseract não conseguiu ler a imagem direito. Recarregando...');
                    const btnRecarregar = await page.$('a[href*="gerarNovaImagemCaptcha"]');
                    if (btnRecarregar) await btnRecarregar.click();
                    await new Promise(r => setTimeout(r, 3000));
                    tentativaCaptcha++;
                }
            }

            if (!captchaResolvido) {
                throw new Error("Falha ao resolver o Captcha de imagem do e-SAJ após várias tentativas.");
            }

            // ==========================================
            // VALIDAÇÃO E EXTRAÇÃO DOS DADOS
            // ==========================================
            await new Promise(r => setTimeout(r, 3000));
            const html = await page.content();

            if (html.includes('Não existem informações disponíveis') || html.includes('Nenhum processo foi encontrado')) {
                console.log(`ℹ️ [eSAJ ${chave}] Processo não encontrado na base de dados.`);
                return null;
            }

            if (html.includes('Este processo é segredo de justiça')) {
                console.log(`🔒 [eSAJ ${chave}] Processo em Segredo de Justiça. Bloqueado para consulta pública.`);
                return null;
            }

            console.log(`✅ [eSAJ ${chave}] Acessou página do processo! Extraindo movimentações...`);

            const dados = await page.evaluate(() => {
                let orgao = "Não informado";

                // Pega a vara/órgão julgador
                const spanOrgao = document.querySelector('#varaProcesso');
                if (spanOrgao) orgao = spanOrgao.textContent?.trim() || "Não informado";

                const movs: any[] = [];
                // Pega TODAS as movimentações (mesmo as que ficam com display:none antes de clicar em expandir)
                const rows = document.querySelectorAll('#tabelaTodasMovimentacoes tr, #tabelaUltimasMovimentacoes tr, .tabelaTodasMovimentacoes tr');

                rows.forEach(tr => {
                    const tds: any = tr.querySelectorAll('td');
                    if (tds.length >= 2) {
                        const dataText = tds[0].textContent?.trim() || '';
                        let descricao = tds[2]?.textContent?.trim() || tds[1].textContent?.trim() || '';

                        // Limpa quebras de linha e excesso de espaços comuns no eSAJ
                        descricao = descricao.replace(/\s+/g, ' ').trim();

                        if (dataText.length >= 10 && descricao) {
                            movs.push({
                                data: dataText,
                                titulo: descricao.substring(0, 100),
                                descricao: descricao,
                                codigo: 999999
                            });
                        }
                    }
                });

                return { orgao, movs };
            });

            console.log(`🎉 SUCESSO! Foram extraídas ${dados.movs.length} movimentações do eSAJ!`);

            return {
                numeroProcesso: numeroCNJ,
                tribunal: `TJ${chave === '8.26' ? 'SP' : chave === '8.12' ? 'MS' : chave === '8.06' ? 'CE' : chave === '8.02' ? 'AL' : chave === '8.04' ? 'AM' : chave === '8.01' ? 'AC' : 'Desconhecido'}`,
                fonte: 'eSAJ',
                orgaoJulgador: dados.orgao,
                movimentacoes: dados.movs
            };

        } catch (error: any) {
            console.error(`❌ [eSAJ ${chave}] Erro durante a extração: ${error.message}`);
            return null;
        } finally {
            await page.close().catch(() => { });
        }
    }
}