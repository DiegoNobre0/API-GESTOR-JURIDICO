// src/services/scrapers/base.scraper.ts
import * as puppeteerVanilla from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Jimp } from 'jimp';
import { createWorker } from 'tesseract.js';

const puppeteer = addExtra(puppeteerVanilla as any);
puppeteer.use(StealthPlugin());

const DEBUG = process.env.SCRAPER_DEBUG === 'true';

let tesseractWorker: any = null;

async function getTesseractWorker() {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker('eng');
    await tesseractWorker.setParameters({
      tessedit_char_whitelist: '0123456789',
    });
  }
  return tesseractWorker;
}

export class BaseScraper {
  private static browserInstance: any | null = null;
  private static requisicoesFeitas = 0;
  private static MAX_REQUISICOES_POR_BROWSER = 50;

  protected async getBrowser() {
    if (BaseScraper.requisicoesFeitas >= BaseScraper.MAX_REQUISICOES_POR_BROWSER) {
      console.log('🔄 [Gerenciador] Limite atingido. Reiniciando browser para liberar RAM...');
      logMemoria('Antes de fechar o Browser');
      await BaseScraper.closeBrowser();
      BaseScraper.requisicoesFeitas = 0;
      logMemoria('Depois de fechar o Browser');
    }

    if (!BaseScraper.browserInstance || !BaseScraper.browserInstance.connected) {
      // 1. Montamos o array de argumentos básico
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ];

      // 2. Injetamos o Proxy (se existir)
      const proxyIp = process.env.PROXY_IP;
      const proxyPort = process.env.PROXY_PORTA;

      if (proxyIp && proxyPort) {
        args.push(`--proxy-server=http://${proxyIp}:${proxyPort}`);
        console.log(`🌐 [Proxy] Navegador iniciado com rede configurada: ${proxyIp}:${proxyPort}`);
      }

      process.env.DISPLAY = ':99';

      // 3. O SEGREDO AQUI: Passamos a variável 'args' que já contém tudo!
      BaseScraper.browserInstance = await puppeteer.launch({
        headless: false,
        args: args, 
        defaultViewport: null,
        protocolTimeout: 360000,
      });
    }

    BaseScraper.requisicoesFeitas++;
    return BaseScraper.browserInstance;
  }

  static async closeBrowser() {
    if (BaseScraper.browserInstance) {
      await BaseScraper.browserInstance.close().catch(() => { });
      BaseScraper.browserInstance = null;
    }
  }

  // 💉 MÉTODO PARA AUTENTICAR A ABA DO NAVEGADOR
  protected async autenticarProxy(page: any) {
    const proxyBase = process.env.PROXY_USUARIO;  // base sem timestamp
    const proxyPass = process.env.PROXY_SENHA;

    // ✅ Gera uma sessão única por aba com timestamp — igual ao que funcionava antes
    const sessionId = `${proxyBase}-session-${Date.now()}-sessTime-15`;

    await page.authenticate({ username: sessionId, password: proxyPass });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log(`🌐 [Proxy] Puppeteer usando a sessão: ${sessionId}`);
  }

  // 🛡️ MÉTODO PARA CORTAR O SANGRAMENTO DE DADOS NO PROXY (Economia de Gigabytes)
  protected async otimizarRede(page: any) {
    await page.setRequestInterception(true);

    page.on('request', (req: any) => {
      const tipo = req.resourceType();
      const url = req.url().toLowerCase();

      // 1. Bloqueio 100% Seguro (Economiza muita banda sem afetar o layout visual)
      if (['font', 'media', 'audio', 'video', 'manifest'].includes(tipo)) {
        return req.abort();
      }

      // 2. Bloqueio de rastreadores e lixo analítico
      if (url.includes('google-analytics') || url.includes('googletagmanager') || url.includes('facebook')) {
        return req.abort();
      }

      // 3. Filtro Cirúrgico de Imagens (O mais importante para a 2Captcha)
      if (tipo === 'image') {
        // Deixa passar QUALQUER imagem que pareça ser um Captcha do PJe ou PROJUDI
        if (
          url.includes('captcha') || 
          url.includes('tencent') || 
          url.includes('gtimg') || 
          url.includes('seam/resource') ||
          url.includes('jcaptcha')
        ) {
          return req.continue();
        }
        
        // Bloqueia brasões, fundos decorativos e fotos
        return req.abort();
      }

      // Deixa passar HTML, JS, CSS, Fetch e XHR (Obrigatórios para o site funcionar e a Visão Computacional acertar a tela)
      req.continue();
    });
  }

  protected async processarCaptcha(buffer: Buffer): Promise<string> {
    try {
      const image = await Jimp.read(buffer);
      image.greyscale().contrast(1).normalize().threshold({ max: 150 });
      const processadoBuffer = await image.getBuffer('image/png');

      const worker = await getTesseractWorker();
      const { data: { text } } = await worker.recognize(processadoBuffer);

      return text.replace(/\s/g, '');
    } catch (err) {
      console.error('❌ Erro Tesseract/Jimp no processamento do Captcha:', err);
      return '';
    }
  }
}

export function logMemoria(contexto: string) {
  const mem = process.memoryUsage();
  const rssMB = (mem.rss / 1024 / 1024).toFixed(2);       // Memória total do processo Node
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(2); // Memória sendo usada pelos seus objetos/variáveis

  console.log(`📊 [RAM - ${contexto}] Node Total (RSS): ${rssMB} MB | Uso Interno (Heap): ${heapMB} MB`);
}