// test-esaj.ts

import { ProcessRunner } from "./runner.js";


async function run() {
    console.log("🚀 Iniciando o teste do e-SAJ - TJSP...");
    const runner = new ProcessRunner();
    
    // Roda apenas o TJSP
    await runner.testarDados();
    
    console.log("🏁 Teste finalizado!");
    process.exit(0);
}

run();