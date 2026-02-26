export function detectGreeting(texto: string): {
  isGreeting: boolean;
  hasTudoBem: boolean;
  isPureGreeting: boolean;
} {
  const normalizado = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/g, '') // remove pontuação e emojis
    .replace(/\s+/g, ' ')
    .trim();

  const saudacoes = [
    'oi',
    'ola',
    'olá',
    'bom dia',
    'boa tarde',
    'boa noite',
  ];

  const variacoesTudoBem = [
    'tudo bem',
    'td bem',
    'tudo bom',
    'tudo certo',
    'tudo ok',
    'tudo joia',
    'tudo joia',
    'como vai',
    'como vc ta',
    'como voce ta',
    'como voce esta',
  ];

  const palavrasBloqueadas = [
    'advogado',
    'processo',
    'acao',
    'ação',
    'caso',
    'problema',
    'direito',
    'indenizacao',
    'indenização',
    'reclamacao',
    'reclamação',
    'contrato',
  ];
  

  const startsWithGreeting = saudacoes.some((s) =>
    normalizado.startsWith(s),
  );

  const hasTudoBem = variacoesTudoBem.some((v) =>
    normalizado.includes(v),
  );

  const hasBlockedContext = palavrasBloqueadas.some((p) =>
    normalizado.includes(p),
  );

  const wordCount = normalizado.split(' ').length;

  const isPureGreeting =
    startsWithGreeting &&
    wordCount <= 6 &&
    !hasBlockedContext;

  return {
    isGreeting: startsWithGreeting,
    hasTudoBem,
    isPureGreeting,
  };

 
}
