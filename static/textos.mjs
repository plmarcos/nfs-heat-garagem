// Catálogo de textos da interface, em português e inglês.
//
// **Um arquivo só, de propósito.** Espalhar tradução pelos módulos é o jeito
// garantido de sobrar string em português numa tela que ninguém abre com
// frequência. Aqui dá para ler as duas colunas lado a lado e ver o que falta.
//
// Valor simples é string. Valor que depende de número ou de argumento é função,
// porque plural não se resolve com marcador: em português "1 opção"/"2 opções"
// troca a palavra, e montar isso com `${n} opç${n>1?'ões':'ão'}` espalha
// gramática pelo código de tela.
//
// Número **não** entra aqui formatado: quem formata é `num()` do `idioma.mjs`,
// que usa `Intl` com o local certo. `1.495 kg` em português é `1,495 kg` em
// inglês, e trocar o separador errado faz a massa do carro errar por mil.

import { registrar } from './idioma.mjs';

registrar({
  // ------------------------------------------------------------ moldura --
  'app.titulo':        { pt: 'Garagem NFS Heat', en: 'NFS Heat Garage' },
  'topo.marca':        { pt: 'Garagem', en: 'Garage' },
  'topo.pecas':        { pt: 'Peças', en: 'Parts' },
  'topo.triangulos':   { pt: 'Triângulos', en: 'Triangles' },
  'topo.fps':          { pt: 'FPS', en: 'FPS' },
  'topo.trocar':       { pt: 'Trocar veículo', en: 'Change vehicle' },
  'trilha.rotulo':     { pt: 'Categorias de peça', en: 'Part categories' },
  'carrossel.titulo':  { pt: 'Peças', en: 'Parts' },
  'carrossel.rotulo':  { pt: 'Variantes da peça', en: 'Part variants' },
  'rodape.idioma':     { pt: 'Idioma da interface', en: 'Interface language' },

  'inspetor.ficha':    { pt: 'Ficha técnica', en: 'Spec sheet' },
  'inspetor.mecanica': { pt: 'Mecânica', en: 'Mechanicals' },
  'inspetor.peca':     { pt: 'Peça', en: 'Part' },
  'inspetor.rodas':    { pt: 'Rodas', en: 'Wheels' },
  'inspetor.escolhaCategoria': { pt: 'Escolha uma categoria.', en: 'Pick a category.' },

  // Atalhos do rodapé. `Roda` é a roda do mouse, não a roda do carro -- em
  // inglês `Scroll` evita a confusão que `Wheel` criaria numa garagem.
  'atalho.arrastar':   { pt: 'Arrastar', en: 'Drag' },
  'atalho.girar':      { pt: 'girar', en: 'rotate' },
  'atalho.roda':       { pt: 'Roda', en: 'Scroll' },
  'atalho.aproximar':  { pt: 'aproximar', en: 'zoom' },
  'atalho.categoria':  { pt: 'categoria', en: 'category' },
  'atalho.peca':       { pt: 'peça', en: 'part' },
  'atalho.recentrar':  { pt: 'recentrar', en: 'recenter' },

  'estado.pronto':     { pt: 'pronto', en: 'ready' },
  'estado.carregando': { pt: 'carregando…', en: 'loading…' },
  'estado.aplicando':  { pt: 'aplicando…', en: 'applying…' },
  'estado.falhou':     { pt: 'falhou', en: 'failed' },

  // ------------------------------------------------------- 21 categorias --
  // Cabem em 84 px com fonte de 9 px: a mais longa em inglês é `Headlights`.
  // O servidor manda o `id` junto com o rótulo, então a tradução sai da chave
  // e o Python continua neutro de idioma.
  'categoria.pintura':    { pt: 'Pintura', en: 'Paint' },
  'categoria.corpo':      { pt: 'Corpo', en: 'Body' },
  'categoria.capo':       { pt: 'Capô', en: 'Hood' },
  'categoria.teto':       { pt: 'Teto', en: 'Roof' },
  'categoria.paralamas':  { pt: 'Para-lamas', en: 'Fenders' },
  'categoria.saias':      { pt: 'Saias', en: 'Skirts' },
  'categoria.splitter':   { pt: 'Splitter', en: 'Splitter' },
  'categoria.difusor':    { pt: 'Difusor', en: 'Diffuser' },
  'categoria.canards':    { pt: 'Canards', en: 'Canards' },
  'categoria.asa':        { pt: 'Asa', en: 'Wing' },
  'categoria.escape':     { pt: 'Escape', en: 'Exhaust' },
  'categoria.grade':      { pt: 'Grade', en: 'Grille' },
  'categoria.farois':     { pt: 'Faróis', en: 'Headlights' },
  'categoria.lanternas':  { pt: 'Lanternas', en: 'Taillights' },
  'categoria.portamalas': { pt: 'Porta-malas', en: 'Trunk' },
  'categoria.retrovisor': { pt: 'Retrovisor', en: 'Mirrors' },
  'categoria.portas':     { pt: 'Portas', en: 'Doors' },
  'categoria.rodas':      { pt: 'Rodas', en: 'Wheels' },
  'categoria.interior':   { pt: 'Interior', en: 'Interior' },
  'categoria.ventilacao': { pt: 'Ventilação', en: 'Vents' },
  'categoria.especiais':  { pt: 'Especiais', en: 'Special' },

  // ---------------------------------------------------------- carrossel --
  'carrossel.semOpcao': { pt: 'sem opção nesta categoria', en: 'no option in this category' },
  'carrossel.opcoes':   { pt: (n) => `${n} ${n === 1 ? 'opção' : 'opções'}`,
                          en: (n) => `${n} ${n === 1 ? 'option' : 'options'}` },
  'carrossel.tri':      { pt: (n) => `${n} tri`, en: (n) => `${n} tri` },
  'carrossel.original': { pt: 'ORIGINAL', en: 'STOCK' },
  'carrossel.nenhuma':  { pt: 'NENHUMA', en: 'NONE' },

  // ------------------------------------------------------------- peça ----
  'peca.slot':       { pt: 'Slot', en: 'Slot' },
  'peca.estado':     { pt: 'Estado', en: 'Status' },
  'peca.semPeca':    { pt: 'sem peça', en: 'no part' },
  'peca.deFabrica':  { pt: 'de fábrica', en: 'stock' },
  'peca.variante':   { pt: 'Variante', en: 'Variant' },
  'peca.triangulos': { pt: 'Triângulos', en: 'Triangles' },
  'peca.arquivo':    { pt: 'Arquivo', en: 'File' },
  'peca.pecasDe':    { pt: (carro) => `Peças de ${carro} — este carro divide a carroceria.`,
                       en: (carro) => `Parts from ${carro} — this car shares its body.` },

  // ---------------------------------------------------------- pintura ----
  'pintura.contador':   { pt: (c, a) => `${c} cores · ${a} acabamentos`,
                          en: (c, a) => `${c} colors · ${a} finishes` },
  'pintura.cor':        { pt: 'Cor', en: 'Color' },
  'pintura.acabamento': { pt: 'Acabamento', en: 'Finish' },
  'pintura.corLivre':   { pt: 'Cor livre', en: 'Custom color' },
  'pintura.nota':       { pt: 'O Heat não tem textura de lataria: a pintura é procedural, '
                            + 'cor mais acabamento, como no próprio jogo.',
                          en: 'Heat has no body-paint texture: the paint is procedural, '
                            + 'color plus finish, just like in the game itself.' },

  'acabamento.brilhante':      { pt: 'Brilhante', en: 'Gloss' },
  'acabamento.metalico':       { pt: 'Metálico', en: 'Metallic' },
  'acabamento.perolizado':     { pt: 'Perolizado', en: 'Pearl' },
  'acabamento.fosco':          { pt: 'Fosco', en: 'Matte' },
  'acabamento.fosco-metalico': { pt: 'Fosco metálico', en: 'Matte metallic' },
  'acabamento.cromado':        { pt: 'Cromado', en: 'Chrome' },
  'acabamento.cor-shift':      { pt: 'Cor-shift', en: 'Color-shift' },

  // ------------------------------------------------------ ficha técnica --
  'ficha.potencia':    { pt: 'Potência', en: 'Power' },
  'ficha.torque':      { pt: 'Torque', en: 'Torque' },
  'ficha.massa':       { pt: 'Massa', en: 'Mass' },
  'ficha.giro':        { pt: 'Giro', en: 'Redline' },
  'ficha.largura':     { pt: 'Largura', en: 'Width' },
  'ficha.comprimento': { pt: 'Comprimento', en: 'Length' },
  'ficha.triangulos':  { pt: 'Triângulos', en: 'Triangles' },

  // `cv` é cavalo-vapor: a constante 7127 da extração só vale para ele. Em
  // inglês vai `hp`, que é o que um jogador espera ler -- e o README diz, por
  // extenso, que é metric hp (cv).
  'unidade.cv':  { pt: 'cv', en: 'hp' },
  'unidade.nm':  { pt: 'N·m', en: 'N·m' },
  'unidade.kg':  { pt: 'kg', en: 'kg' },
  'unidade.rpm': { pt: 'rpm', en: 'rpm' },
  'unidade.mm':  { pt: 'mm', en: 'mm' },

  'ficha.aRpm':           { pt: (n) => `a ${n} rpm`, en: (n) => `at ${n} rpm` },
  'ficha.porTonelada':    { pt: (n) => `${n} cv por tonelada`, en: (n) => `${n} hp per tonne` },
  'ficha.corteEm':        { pt: (n) => `corte em ${n}`, en: (n) => `cut at ${n}` },
  'ficha.semAjuste':      { pt: 'O jogo não traz ficha de ajuste para este veículo, então '
                              + 'potência e torque não aparecem — em vez de um número inventado.',
                            en: 'The game ships no tuning data for this vehicle, so power and '
                              + 'torque are not shown — rather than a made-up number.' },
  'ficha.curvaRotulo':    { pt: (lo, hi, pico) => `Curva de torque de ${lo} a ${hi} rpm, `
                              + `pico de ${pico} newton-metro`,
                            en: (lo, hi, pico) => `Torque curve from ${lo} to ${hi} rpm, `
                              + `peak of ${pico} newton-metres` },

  // ------------------------------------------------------------ mecânica --
  'mecanica.semFicha': { pt: 'Sem ficha de ajuste para este veículo.',
                         en: 'No tuning data for this vehicle.' },
  'mecanica.semDados': { pt: 'Sem dados mecânicos.', en: 'No mechanical data.' },
  'mecanica.tracao':        { pt: 'Tração', en: 'Drivetrain' },
  'mecanica.marchas':       { pt: 'Marchas', en: 'Gears' },
  'mecanica.relacaoFinal':  { pt: 'Relação final', en: 'Final drive' },
  'mecanica.entreEixos':    { pt: 'Entre-eixos', en: 'Wheelbase' },
  'mecanica.bitolaF':       { pt: 'Bitola diant. (física)', en: 'Front track (physics)' },
  'mecanica.bitolaT':       { pt: 'Bitola tras. (física)', en: 'Rear track (physics)' },
  'mecanica.marchaLenta':   { pt: 'Marcha lenta', en: 'Idle' },
  'mecanica.dadosDe':       { pt: (origem, como) => `Dados de ${origem}${como ? ` · ${como}` : ''}`,
                              en: (origem, como) => `Data from ${origem}${como ? ` · ${como}` : ''}` },

  'tracao.traseira':  { pt: 'Traseira', en: 'RWD' },
  'tracao.dianteira': { pt: 'Dianteira', en: 'FWD' },
  'tracao.integral':  { pt: 'Integral', en: 'AWD' },

  // Como a ficha casou com a pasta de ajuste. O servidor manda a razão em
  // português como chave; o front traduz pelo texto exato e, se aparecer uma
  // razão nova, mostra a original em vez de sumir com ela.
  'como.exata':                     { pt: 'exata', en: 'exact match' },
  'como.sem underscore':            { pt: 'sem underscore', en: 'without underscore' },
  'como.sem ano':                   { pt: 'sem ano', en: 'without year' },
  'como.sem underscore nem ano':    { pt: 'sem underscore nem ano', en: 'without underscore or year' },
  'como.sem sufixo de edicao':      { pt: 'sem sufixo de edição', en: 'without edition suffix' },
  'como.ficha do doador de pecas':  { pt: 'ficha do doador de peças', en: "parts donor's spec sheet" },
  'como.alias conferido a mao':     { pt: 'alias conferido à mão', en: 'hand-checked alias' },
  'como.prefixo comum':             { pt: 'prefixo comum', en: 'common prefix' },

  // -------------------------------------------------------------- rodas --
  'rodas.indisponivel': { pt: 'Este veículo não tem roda no acervo.',
                          en: 'This vehicle has no wheel in the library.' },
  'rodas.nota':         { pt: 'Medidas de <code>_rodas_eixos.csv</code>, ajustadas na malha para a roda cair no arco. Não são a bitola da física do jogo, que a Mecânica mostra à parte — as duas medem coisas diferentes.',
                          en: 'Measurements from <code>_rodas_eixos.csv</code>, adjusted on the mesh so the wheel lands in the arch. They are not the physics track width, which Mechanicals shows separately — the two measure different things.' },
  'rodas.diamFrente':   { pt: 'Diâmetro diant.', en: 'Front diameter' },
  'rodas.diamTras':     { pt: 'Diâmetro tras.', en: 'Rear diameter' },
  'rodas.largFrente':   { pt: 'Largura diant.', en: 'Front width' },
  'rodas.largTras':     { pt: 'Largura tras.', en: 'Rear width' },
  'rodas.meiaBitola':   { pt: 'Meia-bitola', en: 'Half-track width' },
  'rodas.entreEixos':   { pt: 'Entre-eixos', en: 'Wheelbase' },

  // ------------------------------------------------------------ seletor --
  'seletor.titulo': { pt: 'Escolher veículo', en: 'Choose a vehicle' },
  'seletor.busca':  { pt: 'Buscar por marca, modelo ou ano', en: 'Search by make, model or year' },
  'seletor.fechar': { pt: 'Fechar', en: 'Close' },
  'seletor.nada':   { pt: 'Nada com esse nome.', en: 'Nothing by that name.' },
  'seletor.meta':   { pt: (ano, pecas, tris) => `${ano} · ${pecas} peças · ${tris} tri`,
                      en: (ano, pecas, tris) => `${ano} · ${pecas} parts · ${tris} tri` },

  // ----------------------------------------------------------- abertura --
  'abertura.iniciando':  { pt: 'iniciando…', en: 'starting…' },
  'abertura.etapa':      { pt: (texto, seg) => `${texto}  ·  ${seg} s`,
                           en: (texto, seg) => `${texto}  ·  ${seg} s` },
  'abertura.tituloEtapa':{ pt: (texto) => `Garagem NFS Heat — ${texto}`,
                           en: (texto) => `NFS Heat Garage — ${texto}` },
  'abertura.tituloErro': { pt: (etapa) => `Garagem NFS Heat — ERRO em ${etapa}`,
                           en: (etapa) => `NFS Heat Garage — ERROR at ${etapa}` },
  'abertura.parou':      { pt: (etapa, erro) => `Parou em "${etapa}": ${erro}`,
                           en: (etapa, erro) => `Stopped at "${etapa}": ${erro}` },
  'abertura.travou':     { pt: (etapa) => `Travou em "${etapa}" há mais de 25 s. `
                              + 'Veja o Diagnóstico ou feche e abra de novo.',
                           en: (etapa) => `Stuck at "${etapa}" for over 25 s. `
                              + 'Check Diagnostics, or close and open it again.' },

  'etapa.verificando3d':  { pt: 'verificando o 3D', en: 'checking 3D' },
  'etapa.lendoAcervo':    { pt: 'lendo o acervo', en: 'reading the library' },
  'etapa.abrindoPrimeiro':{ pt: (n) => `${n} veículos · abrindo o primeiro`,
                            en: (n) => `${n} vehicles · opening the first` },
  'etapa.carroceria':     { pt: 'carregando a carroceria…', en: 'loading the body…' },
  'etapa.materiais':      { pt: 'preparando os materiais…', en: 'preparing materials…' },
  'etapa.rodas':          { pt: 'montando as rodas…', en: 'mounting the wheels…' },
  'etapa.hud':            { pt: 'montando o HUD', en: 'building the HUD' },
  'etapa.ficha':          { pt: 'lendo a ficha do veículo', en: "reading the vehicle's spec sheet" },
  'etapa.semGpu':         { pt: 'sem aceleração de vídeo — modo leve',
                            en: 'no video acceleration — light mode' },

  // -------------------------------------------------------------- erros --
  'erro.semWebGL':     { pt: 'WebGL não está disponível nesta janela',
                         en: 'WebGL is not available in this window' },
  'erro.peca':         { pt: (msg) => `Não deu para carregar a peça: ${msg}`,
                         en: (msg) => `Could not load the part: ${msg}` },
  'erro.falhou':       { pt: (msg) => `Falhou: ${msg}`, en: (msg) => `Failed: ${msg}` },
  'erro.abrirVeiculo': { pt: (msg) => `Não consegui abrir o veículo: ${msg}`,
                         en: (msg) => `Could not open the vehicle: ${msg}` },
  'erro.contexto3d':   { pt: 'O contexto 3D caiu. Feche e abra a garagem.',
                         en: 'The 3D context was lost. Close and reopen the garage.' },
  'aviso.semGpu':      { pt: 'Sem aceleração de vídeo nesta janela: sombras desligadas '
                           + 'para manter a fluidez.',
                         en: 'No video acceleration in this window: shadows turned off '
                           + 'to keep it smooth.' },
  'aviso.gruposSoltos':{ pt: (n) => `${n} grupo${n === 1 ? '' : 's'} solto${n === 1 ? '' : 's'} `
                            + `descartado${n === 1 ? '' : 's'} nesta carroceria.`,
                         en: (n) => `${n} stray group${n === 1 ? '' : 's'} discarded on this body.` },

  // --------------------------------------------------- falta o acervo --
  'semAcervo.faixa':  { pt: 'Falta o acervo', en: 'Library missing' },
  'semAcervo.titulo': { pt: 'Os modelos n\u00e3o v\u00eam junto', en: 'The models do not ship with it' },
  'semAcervo.corpoHtml': {
    pt: 'Este programa \u00e9 <b>s\u00f3 o c\u00f3digo</b>. Nenhum modelo, textura ou pe\u00e7a do '
      + '<i>Need for Speed Heat</i> acompanha o download \u2014 esse material \u00e9 da '
      + '<b>Electronic Arts</b>, e cada um precisa extrair da <b>pr\u00f3pria c\u00f3pia do jogo</b>.',
    en: 'This program is <b>code only</b>. No model, texture or part from '
      + '<i>Need for Speed Heat</i> comes with the download \u2014 that material belongs to '
      + '<b>Electronic Arts</b>, and each person has to extract it from '
      + '<b>their own copy of the game</b>.' },
  'semAcervo.jaTenho': { pt: 'J\u00e1 tenho os arquivos', en: 'I already have the files' },
  'semAcervo.comoCarregarHtml': {
    pt: 'Aponte para a pasta que tem o <code>_indice.csv</code>. Na janela de desktop, '
      + 'use o bot\u00e3o acima; pelo terminal, <code>Garagem.bat --acervo "D:\\CarsNfSHeat"</code>.',
    en: 'Point it at the folder that has <code>_indice.csv</code>. In the desktop window, '
      + 'use the button above; from a terminal, '
      + '<code>Garagem.bat --acervo "D:\\CarsNfSHeat"</code>.' },
  'semAcervo.nota': {
    pt: 'O c\u00f3digo deste projeto \u00e9 MIT. O material do jogo n\u00e3o \u00e9, e continua sendo da '
      + 'Electronic Arts \u2014 este projeto n\u00e3o tem v\u00ednculo com ela.',
    en: 'The code in this project is MIT. The game material is not, and remains the '
      + 'property of Electronic Arts \u2014 this project has no affiliation with them.' },
  'semAcervo.ferramentas': { pt: 'Como extrair do jogo', en: 'How to extract from the game' },
  'semAcervo.proprio':     { pt: 'Baixar os arquivos', en: 'Download the files' },
  'semAcervo.erroPasta':   { pt: 'Essa pasta não tem o <code>_indice.csv</code> — não é o acervo. '
                             + 'Escolha a pasta que contém as pastas <code>car_*</code>.',
                             en: 'That folder has no <code>_indice.csv</code> — it is not the library. '
                             + 'Pick the folder that contains the <code>car_*</code> folders.' },
  'semAcervo.erroServidor': { pt: 'A pasta foi aceita, mas o servidor não subiu. Feche e abra o app.',
                             en: 'The folder was accepted, but the server did not come up. Close and reopen the app.' },
  'semAcervo.escolher':    { pt: 'Escolher pasta\u2026', en: 'Choose folder\u2026' },
  'semAcervo.escolhendo':  { pt: 'abrindo o seletor de pasta\u2026', en: 'opening the folder picker\u2026' },

  // ------------------------------------------------------ aviso de pausa --
  'pausado.faixa':  { pt: 'Aviso do projeto', en: 'Project notice' },
  'pausado.titulo': { pt: 'Trabalho pausado', en: 'Work paused' },
  // As duas chaves abaixo terminam em `Html` porque **carregam marcacao** e sao
  // aplicadas por `data-i18n-html`. Quem traduzir precisa manter as tags.
  'pausado.corpoHtml': { pt: 'O desenvolvimento desta garagem está <b>pausado</b>. O que está '
                           + 'aqui funciona e continua aberto: <b>quem quiser modificar, pode</b> '
                           + '— mexer no código, trocar a sala, acrescentar peça, corrigir o que '
                           + 'achar errado. Não é preciso pedir permissão nem avisar ninguém.',
                         en: 'Development of this garage is <b>paused</b>. What is here works and '
                           + 'stays open: <b>anyone who wants to modify it may</b> — change the '
                           + 'code, swap the showroom, add parts, fix whatever looks wrong. No '
                           + 'permission needed, no one to ask.' },
  'pausado.notaHtml':  { pt: 'Código sob licença MIT · <code>README.md</code> · '
                           + '<code>README.en.md</code><br>Nenhum arquivo do jogo acompanha o projeto.',
                         en: 'Code under the MIT license · <code>README.md</code> · '
                           + '<code>README.en.md</code><br>No game files ship with the project.' },
  'pausado.botao':  { pt: 'Entendi', en: 'Got it' },
  'pausado.baixar': { pt: 'Baixar os modelos', en: 'Download the models' },
});
