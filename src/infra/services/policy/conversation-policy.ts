/* ---------------------------------
   CONVERSATION POLICY
--------------------------------- */

import type { WorkflowStep } from "./workflow-step.js";



export class ConversationPolicy {
  /* ---------------------------------
     BLOQUEIO DE PEDIDO FORA DE ETAPA
  --------------------------------- */

  static deveBloquearPedidoDocumento(
    etapaAtual: WorkflowStep,
    respostaIA: string,
  ): boolean {
    const pediuDocumento =
      /rg|cnh|cpf|documento|comprovante|laudo|extrato|ctps/i.test(
        respostaIA,
      );

    if (pediuDocumento && etapaAtual !== 'COLETA_DOCS') {
      return true;
    }

    return false;
  }

  /* ---------------------------------
     PODE SOLICITAR DOCUMENTOS?
  --------------------------------- */

  static podeSolicitarDocumento(etapaAtual: WorkflowStep): boolean {
    return etapaAtual === 'COLETA_DOCS';
  }

  /* ---------------------------------
     PODE AVANÇAR ETAPA?
  --------------------------------- */

  static podeAvancarEtapa(
    etapaAtual: WorkflowStep,
    documentosPendentes: string[],
  ): boolean {
    if (etapaAtual === 'COLETA_DOCS' && documentosPendentes.length > 0) {
      return false;
    }

    return true;
  }

  /* ---------------------------------
     DOCUMENTO SENSÍVEL
  --------------------------------- */

  static documentoEhSensivel(descricao: string): boolean {
    return /laudo|médico|saúde/i.test(descricao);
  }

  /* ---------------------------------
     FALLBACK QUANDO CLIENTE SOME
  --------------------------------- */

  static mensagemFallback(etapaAtual: WorkflowStep): string {
    if (etapaAtual === 'COLETA_DOCS') {
      return 'Quando puder, fico aguardando o envio do documento para seguirmos.';
    }

    if (etapaAtual === 'COLETA_FATOS') {
      return 'Fico no aguardo das informações para dar continuidade.';
    }

    return 'Quando quiser, seguimos daqui.';
  }
}