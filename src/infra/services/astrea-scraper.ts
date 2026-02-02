// src/infra/services/astrea-scraper.ts
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import type { AstreaProcessoDTO, IAstreaService } from '../../core/services/astrea-service-interface';


export class AstreaScraper implements IAstreaService {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(private email: string, private password: string) {}

  async login(): Promise<boolean> {
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({ viewport: { width: 1920, height: 1080 } });
    this.page = await context.newPage();

    try {
      await this.page.goto("https://app.astrea.net.br", { waitUntil: 'networkidle', timeout: 60000 });
      
      const inputs = await this.page.locator('input').all();
      if (inputs.length >= 2) {
        await inputs[0]?.fill(this.email);
        await inputs[1]?.fill(this.password);
        
        const buttons = await this.page.locator('button').all();
        if (buttons.length > 0) {
          await buttons[0]?.click();
          await this.page.waitForTimeout(5000);
        }
      }

      return this.page.url().includes("main");
    } catch (error) {
      console.error("Erro no login Astrea:", error);
      return false;
    }
  }

  async getProcessosList(): Promise<AstreaProcessoDTO[]> {
    if (!this.page) return [];

    try {
      await this.page.goto("https://astrea.net.br/#/main/folders/[,,]", { timeout: 30000 });
      await this.page.waitForTimeout(5000);

      const textContent = await this.page.evaluate(() => document.body.innerText);
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l);
      
      const cnjPattern = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
      const processos: AstreaProcessoDTO[] = [];
      let current: Partial<any> = {};

      for (const line of lines) {
        const cnjMatch = line.match(cnjPattern);
        if (cnjMatch) {
          if (current.numero) processos.push(current as AstreaProcessoDTO);
          current = { numero: cnjMatch[0] };
          continue;
        }

        if (line.toLowerCase().includes(" x ") || line.toLowerCase().includes(" vs ")) {
          current.partes = line;
          current.cliente = line.split(/\s+x\s+/i)[0]?.trim();
        }

        if (/\d{2}\/\d{2}\/\d{4}$/.test(line)) {
          current.ultimaMovimentacao = line;
        }
      }

      if (current.numero) processos.push(current as AstreaProcessoDTO);
      return processos;
    } catch (error) {
      console.error("Erro ao extrair processos:", error);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }
}