// Icones autorais, 24x24, traco simples. Nenhum e' copiado do jogo: sao
// desenhos proprios, o que tambem evita levar arte de terceiro para o
// repositorio publico.

const P = {
  corpo: 'M3 14l2-5h14l2 5v4h-3v-2H6v2H3z M6 14h12',
  capo: 'M3 16c3-6 6-8 9-8s6 2 9 8 M6 16h12',
  teto: 'M4 15l4-7h8l4 7 M8 8v7 M16 8v7',
  paralamas: 'M3 17c0-5 4-9 9-9s9 4 9 9 M7 17a5 5 0 0110 0',
  saias: 'M4 12h16 M5 15h14 M4 12l1 3 M20 12l-1 3',
  splitter: 'M3 15h18 M6 12h12 M3 15l2 3 M21 15l-2 3',
  difusor: 'M4 10h16v6H4z M8 10v6 M12 10v6 M16 10v6',
  canards: 'M5 9l6 3-6 3 M13 9l6 3-6 3',
  asa: 'M3 9h18 M6 9v4 M18 9v4 M4 13h16',
  escape: 'M3 14h11a3 3 0 013 3 M17 11h4 M17 15h4 M19 9v2 M19 15v2',
  grade: 'M4 8h16v8H4z M4 11h16 M4 14h16 M9 8v8 M15 8v8',
  farois: 'M4 12a5 4 0 0110 0 5 4 0 01-10 0 M16 9l4-2 M16 12h5 M16 15l4 2',
  lanternas: 'M4 10h9a4 2 0 010 4H4z M17 9l3 3-3 3',
  portamalas: 'M4 15c2-4 5-6 8-6s6 2 8 6 M4 15h16 M12 9v6',
  retrovisor: 'M7 8a4 3 0 018 0v3H7z M11 11v5 M8 16h6',
  portas: 'M5 6h9l5 5v7H5z M14 6v5h5 M8 14h3',
  rodas: 'M12 4a8 8 0 100 16 8 8 0 000-16z M12 9a3 3 0 100 6 3 3 0 000-6z M12 4v5 M12 15v5 M4 12h5 M15 12h5',
  interior: 'M7 17V9a3 3 0 016 0v8 M6 17h9 M15 12h3v5h-3',
  ventilacao: 'M12 12a3 3 0 100-.01 M12 9V4 M12 20v-5 M9 12H4 M20 12h-5',
  especiais: 'M12 3l2.2 5.6L20 9.6l-4 4 1 6-5-2.9L7 19.6l1-6-4-4 5.8-1z',
  pintura: 'M6 4h12v6H6z M9 10v3h6v-3 M11 13v7h2v-7',
  vinil: 'M4 6h16v12H4z M4 12c4-4 8 4 12 0s4 0 4 0',
  original: 'M12 3a9 9 0 100 18 9 9 0 000-18z M8 12l3 3 5-6',
  nenhuma: 'M12 3a9 9 0 100 18 9 9 0 000-18z M8 8l8 8 M16 8l-8 8',
};

export function icone(chave) {
  const d = P[chave] || P.especiais;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" `
       + `stroke-linejoin="round"><path d="${d}"/></svg>`;
}
