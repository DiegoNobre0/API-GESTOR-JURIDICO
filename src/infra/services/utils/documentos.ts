export function normalizarTipoDocumento(tipo?: string) {
  if (!tipo) return '';

  const t = tipo.toUpperCase();

  // RG
  if (['RG', 'RG_FRENTE', 'RG_VERSO', 'RG_FOTO'].includes(t)) return 'RG';

  // CNH
  if (['CNH', 'CNH_FRENTE', 'CNH_VERSO', 'CNH_FOTO'].includes(t)) return 'CNH';

  // Endereço
  if (
    ['COMPROVANTE_RESIDENCIA', 'COMPROVANTE_DE_RESIDENCIA', 'ENDERECO']
      .includes(t)
  ) {
    return 'COMP_RES';
  }

  return t;
}
