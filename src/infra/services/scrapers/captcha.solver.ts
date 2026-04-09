// src/services/scrapers/captcha.solver.ts
import axios from 'axios';
import { Page } from 'puppeteer';
import { Jimp } from 'jimp';

// ── Configurações ─────────────────────────────────────────────────────────────
const CAPSOLVER_URL = 'https://api.capsolver.com';
const TWOCAPTCHA_URL = 'https://api.2captcha.com';
const CAPSOLVER_KEY = process.env.CAPSOLVER_API_KEY ?? '';
const TWOCAPTCHA_KEY = process.env.TWOCAPTCHA_API_KEY ?? '';
const POLL_INTERVAL = 10_000;
const TIMEOUT = 180_000; // 3 minutos para dar fôlego ao worker

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface GeeTestV3Params {
  gt: string;
  challenge: string;
  pageUrl: string;
}

interface CapSolverSolution {
  validate: string;
  challenge: string;
  seccode: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEETEST — helpers internos
// ─────────────────────────────────────────────────────────────────────────────
async function criarTarefaCapSolver(params: GeeTestV3Params): Promise<string> {
  const res = await axios.post(`${CAPSOLVER_URL}/createTask`, {
    clientKey: CAPSOLVER_KEY,
    task: {
      type: 'GeeTestTaskProxyless',
      websiteURL: params.pageUrl,
      gt: params.gt,
      challenge: params.challenge,
    },
  });
  if (res.data.errorId !== 0)
    throw new Error(`CapSolver createTask: ${res.data.errorDescription}`);
  console.log(`🧩 [CapSolver] Tarefa GeeTest criada: ${res.data.taskId}`);
  return res.data.taskId;
}

async function aguardarResultadoCapSolver(taskId: string): Promise<CapSolverSolution> {
  const inicio = Date.now();
  while (Date.now() - inicio < TIMEOUT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    const res = await axios.post(`${CAPSOLVER_URL}/getTaskResult`, {
      clientKey: CAPSOLVER_KEY,
      taskId,
    });
    if (res.data.errorId !== 0)
      throw new Error(`CapSolver getTaskResult: ${res.data.errorDescription}`);
    if (res.data.status === 'ready') {
      console.log(`✅ [CapSolver] GeeTest resolvido!`);
      return res.data.solution as CapSolverSolution;
    }
    console.log(`⏳ [CapSolver] Aguardando... (${Math.round((Date.now() - inicio) / 1000)}s)`);
  }
  throw new Error('[CapSolver] Timeout: GeeTest não resolvido.');
}

// ─────────────────────────────────────────────────────────────────────────────
// GEETEST — Interceptação e Injeção
// ─────────────────────────────────────────────────────────────────────────────
let paramsInterceptados: GeeTestV3Params | null = null;

export function escutarChamadasGeeTest(page: Page): void {
  paramsInterceptados = null;
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('geetest') && (url.includes('register') || url.includes('get.php'))) {
      try {
        const text: any = await response.text();
        const matchGt: any = text.match(/"gt"\s*:\s*"([^"]+)"/);
        const matchChallenge = text.match(/"challenge"\s*:\s*"([^"]+)"/);
        if (matchGt && matchChallenge) {
          paramsInterceptados = {
            gt: matchGt[1],
            challenge: matchChallenge[1],
            pageUrl: page.url(),
          };
          console.log(`🔍 [CapSolver] Params GeeTest interceptados: gt=${matchGt[1].substring(0, 8)}...`);
        }
      } catch { /* ignora erros */ }
    }
  });
}

export async function extrairParamsGeeTest(page: Page): Promise<GeeTestV3Params | null> {
  try {
    const params = await page.evaluate(() => {
      const el = document.querySelector('[data-gt], [gt], #captcha-box');
      if (el) {
        return {
          gt: el.getAttribute('data-gt') ?? el.getAttribute('gt') ?? '',
          challenge: el.getAttribute('data-challenge') ?? el.getAttribute('challenge') ?? '',
        };
      }
      const w = window as any;
      if (w._gt && w._challenge) return { gt: w._gt, challenge: w._challenge };
      return null;
    });
    return params?.gt && params?.challenge ? { ...params, pageUrl: page.url() } : null;
  } catch {
    return null;
  }
}

export async function injetarSolucaoGeeTest(page: Page, solution: CapSolverSolution): Promise<void> {
  await page.evaluate((sol) => {
    const w = window as any;
    // Injeta nos campos que o PJe espera para GeeTest
    const enc = document.querySelector('input[name*="geetest_challenge"]') as HTMLInputElement;
    const val = document.querySelector('input[name*="geetest_validate"]') as HTMLInputElement;
    const sec = document.querySelector('input[name*="geetest_seccode"]') as HTMLInputElement;
    if (enc) enc.value = sol.challenge;
    if (val) val.value = sol.validate;
    if (sec) sec.value = sol.seccode;
  }, solution);
}

export async function resolverCaptchaPje(page: Page): Promise<boolean> {
  if (!CAPSOLVER_KEY) return false;
  try {
    const params = (await extrairParamsGeeTest(page)) ?? paramsInterceptados;
    if (!params) return false;
    const taskId = await criarTarefaCapSolver(params);
    const solution = await aguardarResultadoCapSolver(taskId);
    await injetarSolucaoGeeTest(page, solution);
    return true;
  } catch (err: any) {
    console.error(`❌ [CapSolver] Falha GeeTest: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TENCENT — Resolvedor principal (Com Lógica de Janela Deslizante)
// ─────────────────────────────────────────────────────────────────────────────

export async function extrairAppIdTencent(page: Page): Promise<string | null> {
  try {
    const appId = await page.evaluate(() => {
      const todos: string[] = [];
      for (const script of Array.from(document.querySelectorAll('script'))) {
        const matches: any = script.innerHTML.matchAll(/new\s+TencentCaptcha\s*\(\s*['"](\d+)['"]/g);
        for (const m of matches) todos.push(m[1]);
      }
      for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
        if (iframe.src?.includes('aid=')) {
          const aid = new URLSearchParams(iframe.src.split('?')[1]).get('aid');
          if (aid) todos.push(aid);
        }
      }
      return todos[0] ?? null;
    });

    return appId ?? '189956587';
  } catch {
    return '189956587';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TENCENT — Resolvedor principal
// ─────────────────────────────────────────────────────────────────────────────
export async function resolverTencentCaptcha(page: Page): Promise<boolean> {
  const MAX_TENTATIVAS = 20; 
  let tentativa = 1;

  while (tentativa <= MAX_TENTATIVAS) {
    console.log(`👁️🤖 [Visão Computacional] Iniciando tentativa ${tentativa}/${MAX_TENTATIVAS}...`);

    try {
      const iframeElement = await page.waitForSelector('iframe[id*="tcaptcha_iframe"]', { timeout: 15000 });
      const frame = await iframeElement!.contentFrame();
      if (!frame) throw new Error("Erro ao acessar frame.");

      console.log("⏳ Aguardando imagem do captcha renderizar...");
      await frame.waitForSelector('#slideBg', { visible: true, timeout: 15000 });
      
      const isReady = await frame.evaluate(() => {
          const img = document.querySelector('#slideBg') as HTMLElement;
          return img && img.offsetWidth > 0 && img.offsetHeight > 0;
      });

      if (!isReady) {
          console.warn("⚠️ Div encontrada mas imagem ainda não carregou. Aguardando 3s...");
          await new Promise(r => setTimeout(r, 3000));
      }

      const infoPeca = await frame.evaluate(() => {
          const bg = document.querySelector('#slideBg');
          if (!bg) return null;
          const bgRect = bg.getBoundingClientRect();

          const items = Array.from(document.querySelectorAll('.tc-fg-item'));
          const peca = items.find(el => {
              const r = el.getBoundingClientRect();
              return r.height > 30 && r.height < 100 && !el.classList.contains('tc-slider-normal');
          });
          
          if (!peca) return null;
          const pecaRect = peca.getBoundingClientRect();

          return { 
              bordaEsquerdaPecaX: pecaRect.left - bgRect.left,
              larguraPecaCSS: pecaRect.width,
              larguraBgCSS: bgRect.width
          };
      });

      if (!infoPeca) throw new Error("Falha ao calcular posição original.");

      await frame.evaluate(() => {
          const overlay = document.querySelectorAll('.tc-fg-item');
          overlay.forEach(el => {
              (el as HTMLElement).style.setProperty('display', 'none', 'important');
          });
      });
      await new Promise(r => setTimeout(r, 500));

      const bgElement = await frame.waitForSelector('#slideBg', { timeout: 5000 });
      const imageBuffer = await bgElement!.screenshot({ encoding: 'binary' }) as Buffer;

      await frame.evaluate(() => {
          const overlay = document.querySelectorAll('.tc-fg-item');
          overlay.forEach(el => {
              (el as HTMLElement).style.removeProperty('display');
          });
      });

      console.log(`🧠 [JIMP] Escaneando a imagem (Filtro Claro-para-Escuro)...`);
      const distanciaArraste = await analisarBuraco(
          imageBuffer,
          infoPeca.bordaEsquerdaPecaX,
          infoPeca.larguraPecaCSS,
          infoPeca.larguraBgCSS
      );

      if (!distanciaArraste || distanciaArraste < 10) {
          throw new Error("Cálculo da imagem falhou.");
      }

      const iframeRect = await page.evaluate((el: any) => {
          const { x, y } = el.getBoundingClientRect();
          return { x, y };
      }, iframeElement);

      const sliderButton = await frame.waitForSelector('.tc-slider-normal', { timeout: 5000 });
      const sliderRect = await frame.evaluate(() => {
          const el = document.querySelector('.tc-slider-normal');
          if (!el) return null;
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
      });

      if (!sliderRect) throw new Error("Botão slider não encontrado.");

      const startX = iframeRect.x + sliderRect.x + (sliderRect.width / 2);
      const startY = iframeRect.y + sliderRect.y + (sliderRect.height / 2);
      const destinoX = startX + distanciaArraste;

      await page.evaluate(() => {
          let cursor = document.getElementById('bolinha-fantasma');
          if (!cursor) {
              cursor = document.createElement('div');
              cursor.id = 'bolinha-fantasma';
              cursor.style.width = '15px'; cursor.style.height = '15px';
              cursor.style.background = 'red'; cursor.style.borderRadius = '50%';
              cursor.style.position = 'fixed'; cursor.style.pointerEvents = 'none'; 
              cursor.style.zIndex = '99999999'; document.body.appendChild(cursor);
          }
      });

      const moverMouseEBolinha = async (x: number, y: number, steps = 1) => {
          await page.mouse.move(x, y, { steps });
          await page.evaluate((cx, cy) => {
              const cursor = document.getElementById('bolinha-fantasma');
              if (cursor) { cursor.style.left = (cx - 7) + 'px'; cursor.style.top = (cy - 7) + 'px'; }
          }, x, y);
      };

      // 7. A DANÇA DO MOUSE COM OVERSHOOT (O Truque de Mestre)
      console.log(`🖱️ Segurando a peça e iniciando o arraste...`);
      await moverMouseEBolinha(startX, startY, 5);
      await page.mouse.down(); 
      
      await page.evaluate(() => {
          const cursor = document.getElementById('bolinha-fantasma');
          if (cursor) cursor.style.background = '#00ff00';
      });

      await new Promise(r => setTimeout(r, Math.random() * 200 + 100)); // Pausa humana

      let currentX = startX;
      const steps = Math.floor(Math.random() * 15) + 30; 
      const stepX = distanciaArraste / steps;

      for (let i = 0; i < steps; i++) {
          currentX += stepX + (Math.random() * 2 - 1); 
          const tremedeiraY = startY + (Math.random() * 3 - 1.5); 
          const delay = i > steps * 0.8 ? Math.random() * 20 + 15 : Math.random() * 10 + 5;
          await moverMouseEBolinha(currentX, tremedeiraY, 1);
          await new Promise(r => setTimeout(r, delay)); 
      }

      // 🚨 OVERSHOOT: O bot "passa do ponto" acidentalmente entre 3 e 7 pixels
      const overshoot = Math.random() * 4 + 3;
      await moverMouseEBolinha(destinoX + overshoot, startY + (Math.random() * 2 - 1), 3);
      await new Promise(r => setTimeout(r, Math.random() * 150 + 100)); // Percebe que passou

      // 🚨 CORREÇÃO: Volta lentamente para a posição correta
      await moverMouseEBolinha(destinoX, startY, 4);
      
      // Confirmação visual (Pausa demorada antes de soltar)
      await new Promise(r => setTimeout(r, Math.random() * 500 + 300)); 
      await page.mouse.up(); 

      await page.evaluate(() => {
          const cursor = document.getElementById('bolinha-fantasma');
          if (cursor) cursor.style.background = 'red'; 
      });
      
      console.log(`✅ Arraste concluído com Micro-Correção! Cruzando os dedos...`);

      // 8. VALIDAÇÃO
      await new Promise(r => setTimeout(r, 4000));
      
      const html = await page.content();
      if (html.toLowerCase().includes('verificação de captcha não está correta')) {
         throw new Error("PJe detectou erro milimétrico no encaixe.");
      }

      let captchaAindaVisivel = true;
      try {
        captchaAindaVisivel = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[src*="tcaptcha"], iframe[id*="tcaptcha"]');
            if (!iframe) return false; 
            let el: Element | null = iframe;
            while (el) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return false; 
                }
                el = el.parentElement;
            }
            const rect = iframe.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
      } catch (e: any) {
        if (e.message.includes('detached') || e.message.includes('Execution context')) {
            captchaAindaVisivel = false;
        }
      }
      
      if (!captchaAindaVisivel) {
         console.log("🎉 BINGO! A PEÇA ENCAIXOU PERFEITAMENTE!");
         return true; 
      } else {
         console.warn("⚠️ Bateu na trave (Ainda Visível). Atualizando imagem...");
         try {
             const refreshBtn = await frame.$('#reload');
             if (refreshBtn) await refreshBtn.click();
         } catch (e) {}
         await new Promise(r => setTimeout(r, 3000)); 
         throw new Error("Peça não encaixou."); 
      }

    } catch (err: any) {
      if (err.message.includes('detached') || err.message.includes('Execution context')) {
          console.log("🎉 BINGO! O Frame foi destruído, PJe avançou!");
          return true;
      }
      console.warn(`⚠️ [Visão Computacional] Falha na tentativa ${tentativa}: ${err.message}`);
      tentativa++; 
    }
  }
  
  console.error(`❌ [Visão Computacional] Esgotou as ${MAX_TENTATIVAS} tentativas.`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Análise Sniper (Claro-para-Escuro)
// ─────────────────────────────────────────────────────────────────────────────
export async function analisarBuraco(
  imageBuffer: Buffer,
  bordaEsquerdaPecaX: number,   
  larguraPecaCSS: number,        
  larguraBgCSS: number           
): Promise<number | null> {

  const image = await Jimp.read(imageBuffer);
  image.greyscale().contrast(0.6);

  const width  = image.bitmap.width;
  const height = image.bitmap.height;
  const scale = width / larguraBgCSS;
  
  const scanStart = Math.round((bordaEsquerdaPecaX + larguraPecaCSS + 5) * scale);                           
  const scanEnd   = width - Math.round(40 * scale);
  const yStart    = Math.floor(height * 0.20);
  const yEnd      = Math.floor(height * 0.80);

  let bestX = scanStart;
  let maxEdge = 0;

  const intToRGBA = (i: number) => ({
    r: (i >>> 24) & 255, g: (i >>> 16) & 255, b: (i >>> 8)  & 255
  });

  const stepLuma = Math.max(1, Math.floor(3 * scale));

  for (let x = scanStart; x < scanEnd; x++) {
    let edgeSum = 0;
    
    for (let y = yStart; y < yEnd; y++) {
      const c1 = intToRGBA(image.getPixelColor(x, y));
      const c2 = intToRGBA(image.getPixelColor(x + stepLuma, y));

      const luma1 = 0.2126 * c1.r + 0.7152 * c1.g + 0.0722 * c1.b;
      const luma2 = 0.2126 * c2.r + 0.7152 * c2.g + 0.0722 * c2.b;
      
      // 🚨 O PULO DO GATO MATEMÁTICO: Sem Math.abs!
      // Só soma se a imagem for do CLARO para o ESCURO. 
      // Ignora texturas que clareiam ou o lado direito do buraco.
      const diff = luma1 - luma2; 
      
      if (diff > 45) { 
        edgeSum += diff;
      }
    }

    const penalty = x < (width / 2) ? 0.8 : 1.0;
    
    if ((edgeSum * penalty) > maxEdge) {
      maxEdge = edgeSum * penalty;
      bestX = x;
    }
  }

  const bestXCSS = bestX / scale;
  let distanciaArraste = bestXCSS - bordaEsquerdaPecaX;

  // Offset adaptado para a borda esquerda (Sombra interna)
  if (bestXCSS > (larguraBgCSS * 0.7)) {
      distanciaArraste -= 8; 
  } else if (bestXCSS > (larguraBgCSS * 0.4)) {
      distanciaArraste -= 6; 
  } else {
      distanciaArraste -= 4; 
  }

  console.log(`🎯 [Borda-Sniper] Borda em px=${bestX} | CSS=${bestXCSS.toFixed(1)} | Arraste Fino=${distanciaArraste.toFixed(1)}px`);

  if (distanciaArraste < 10) {
    return null;
  }

  return distanciaArraste;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTEADOR PÚBLICO
// ─────────────────────────────────────────────────────────────────────────────
export async function resolverCaptchaAutomatico(page: Page, chave: string): Promise<boolean> {
  console.log(`⏳ [PJe ${chave}] Aguardando o modal do Captcha abrir completamente...`);

  // 🚨 A MÁGICA: Força o Puppeteer a esperar o AJAX do JSF renderizar o modal na tela
  // O parâmetro 'visible: true' garante que não é um código fantasma, ele está na cara do robô!
  const captchaNaTela = await page.waitForSelector(
    '#tcaptcha_transform_dy, iframe[id*="tcaptcha"], iframe[src*="tcaptcha"], .tcaptcha-transform, .geetest_holder',
    { timeout: 15000, visible: true }
  ).catch(() => null);

  if (!captchaNaTela) {
    console.log(`⏩ [PJe ${chave}] Nenhum captcha detectado na tela (Passou direto ou sem bloqueio).`);
    return true;
  }

  // Dá um fôlego extra de 1 segundo para as animações e scripts nativos do PJe assentarem
  await new Promise(r => setTimeout(r, 5000));

  const isTencent = await page.$('#tcaptcha_transform_dy, iframe[id*="tcaptcha"], iframe[src*="tcaptcha"], .tcaptcha-transform');
  const isGeetest = await page.$('.geetest_holder, [class*="geetest"], iframe[src*="geetest"]');

  if (isTencent) {
    console.warn(`🧩 [PJe ${chave}] Tencent físico detectado na tela. Iniciando envio para a Rússia...`);
    return resolverTencentCaptcha(page);
  }

  if (isGeetest) {
    console.warn(`🧩 [PJe ${chave}] GeeTest Detectado.`);
    const ok = await resolverCaptchaPje(page);
    if (ok) {
      await page.evaluate(() => {
        const btn = document.querySelector('input[id*="searchProcessos"], button[id*="pesquisar"]') as HTMLElement;
        btn?.click();
      });
    }
    return ok;
  }

  return true;
}