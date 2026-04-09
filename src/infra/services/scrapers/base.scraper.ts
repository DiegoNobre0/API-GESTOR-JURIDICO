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
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-popup-blocking'
      ];

      // 💉 INJETANDO O PROXY NO CHROMIUM (IP e Porta) ATIVADO!
      const proxyIp = process.env.PROXY_IP;
      const proxyPort = process.env.PROXY_PORTA;

      if (proxyIp && proxyPort) {
        args.push(`--proxy-server=http://${proxyIp}:${proxyPort}`);
        console.log(`🌐 [Proxy] Navegador iniciado com rede configurada: ${proxyIp}:${proxyPort}`);
      }

      BaseScraper.browserInstance = await puppeteer.launch({
        headless: false,
        args,
        defaultViewport: { width: 1280, height: 800 },
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
  console.log(`🌐 [Proxy] Puppeteer usando a sessão: ${sessionId}`);
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