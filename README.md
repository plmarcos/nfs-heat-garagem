# Garagem NFS Heat

Uma **garagem 3D de desktop** para montar e customizar os veículos extraídos do
*Need for Speed Heat*: escolher o carro, trocar peça por peça entre as variantes
do catálogo de customização, montar as rodas na medida certa, pintar, e ver o
resultado numa sala renderizada — com um HUD no estilo do jogo.

**Português** · [English](README.en.md)

> **Trabalho pausado.** O desenvolvimento deste projeto está parado. O que está
> aqui funciona e continua aberto: **quem quiser modificar, pode** — mexer no
> código, acrescentar peça, corrigir o que achar errado. Não é preciso pedir
> permissão nem avisar ninguém. O código é MIT.

---

## Este repositório não traz arquivo de jogo

Aqui só tem **código**. Nenhum modelo, textura ou peça do Need for Speed Heat
acompanha o repositório — esse material é da **Electronic Arts**. O `.gitignore`
bloqueia `*.obj`, `*.mtl`, `*.png`, `*.fbx` e `*.csv` justamente para que um
descuido não publique asset.

Nenhum ícone, fonte ou textura da interface foi copiado do jogo: todo ícone é um
SVG autoral, toda superfície da sala é desenhada em canvas, e a tipografia usa a
**Bahnschrift**, que já vem no Windows.

Este projeto não tem vínculo com a Electronic Arts nem com a Criterion Games.

## O que você precisa

- **Windows 10/11** com WebView2 (já vem no Windows 11)
- **Python 3.11+** com `numpy`
- **`pywebview`** para a janela de desktop — `py -3.11 -m pip install -r requirements.txt`
- O **acervo extraído**: a pasta com `_indice.csv` e as pastas `car_*`, produzida
  pelas ferramentas do repositório `nfs-heat-car-tools`

## Como abrir

```
Garagem.bat
```

Ou, se o acervo não estiver em `F:\CarsNfSHeat`:

```
Garagem.bat --acervo "D:\CarsNfSHeat"
```

Sem `pywebview`, dá para rodar no navegador:

```
py -3.11 garagem.py --acervo "D:\CarsNfSHeat"
```

A pasta do acervo é resolvida nesta ordem: `--acervo` → variável de ambiente
`NFSHEAT_ACERVO` → `%LOCALAPPDATA%\NFSHeatGaragem\config.json` → `F:\CarsNfSHeat`.

**Sem acervo nenhum, o app abre do mesmo jeito.** Não recusa subir nem despeja um
erro num terminal que provavelmente nem está aberto: mostra uma tela explicando
que os modelos não acompanham o programa, com um botão para as ferramentas de
extração e, na janela de desktop, um **Escolher pasta…** que abre o seletor do
Windows. O servidor sobe em modo sem acervo, serve a página e responde **503** em
qualquer rota que dependa dos arquivos — 503 e não 404, porque o recurso existe:
o que falta é a pasta.

O botão "Escolher pasta" **não** usa ponte `js_api` (ela já pendurou esta janela
uma vez) nem rota de escrita no servidor. A página navega para `/escolher-pasta` e
o lançador, que é quem detém a janela, **lê** a URL e reage — só leitura, de um
lado só.

## O que dá para fazer

| | |
|---|---|
| **168 veículos** | seletor com busca por marca, modelo e ano |
| **13.834 peças** | trocadas por slot, com miniatura renderizada de cada uma |
| **Rodas** | aro e pneu montados a partir de `_rodas_eixos.csv`, na medida do jogo |
| **Pintura** | 16 cores, cor livre e 7 acabamentos, com flake metálico procedural |
| **Ficha técnica** | potência, torque, massa, giro, tração e curva de torque, lidas do EBX de ajuste do jogo |
| **Sala** | showroom escuro, piso polido, LED ciano, softboxes no teto |
| **Idioma** | português ou inglês, escolhido na primeira abertura e trocável no rodapé |

Atalhos: arrastar gira, roda aproxima, `↑ ↓` troca de categoria, `← →` troca de
peça, `R` recentra, `Esc` fecha o seletor.

## Como funciona por dentro

**O OBJ vira binário no servidor, não no navegador.** Uma carroceria de 6,9 MB é
convertida em 0,16 s com numpy e sai como 2,7 MB de buffer (`NFSG1`: cabeçalho
JSON mais posições, normais, UVs e índices). Em JSON de texto seriam ~20 MB mais
o parse. O decodificador do lado do navegador devolve *views* sobre o
`ArrayBuffer`, sem copiar nada.

**As normais são calculadas na conversão.** Nenhum OBJ do acervo traz `vn` — o
Heat guarda a normal comprimida em TangentSpace e a extração nunca desempacotou.
A suavização é feita **por objeto, depois de compactar**, então a quina entre o
capô e a carroceria continua dura, que é o certo num carro.

**A pintura é procedural.** O Heat não tem textura de lataria: é cor mais
acabamento, composto em tempo de execução. Conferido no acervo — não existe um
único arquivo `*carpaint*` em nenhuma pasta `textures/`.

**As miniaturas usam um renderer offscreen só.** Um por cartão estouraria o
limite de contextos WebGL em poucos segundos de rolagem. `IntersectionObserver`
enfileira só o que está na tela e a fila roda em série, cedendo o quadro entre um
item e outro.

**Uma pasta de peças serve vários carros.** Os 168 veículos saem de 115 pastas do
jogo: conversível, roadster e edição especial dividem carroceria e peças. O
`_mods_mapa.csv` diz quem usa o quê, e o inspetor mostra quando um carro está
usando peça de outro.

## Verificar

```
py -3.11 -m nfsgaragem.verificar --acervo "D:\CarsNfSHeat" --tudo
```

Converte **as 168 carrocerias e as 13.834 peças** e grava um CSV com objetos,
vértices, triângulos, tempo e defeitos, mais o histograma de materiais. Leva
cerca de 3 minutos. É a checagem que prova que o leitor sobrevive aos arquivos de
verdade, e não só aos três que se testa à mão.

Na última execução: **14.171 arquivos, 0 falhas, 52 milhões de triângulos**, em
147 s. Um único grupo solto no acervo inteiro — o paralama
`fenderfr_setf.obj` do 240ZG, com um pedaço a 62,8 m do resto da peça — e 29
ocorrências de material sem papel definido, todas nomes de rascunho do Maya
(`lambert1`, `blinn1`) ou adereço de cenário.

Foi a varredura que achou dois defeitos meus: o limite fixo de 5 m para grupo
solto descartava a placa legítima de um reboque de 24 m (virou limite relativo ao
tamanho da peça), e faltava a grafia britânica `Aluminium` na tabela de
materiais, o que jogava 10 materiais no genérico.

## A ficha técnica vem do jogo

O `ferramentas/extrair_ficha.ps1` lê o EBX de ajuste (`Vehicles/Tuning/...`) pelo
mesmo caminho do Frosty que extrai as malhas, e grava `_ficha_tecnica.csv` no
acervo. Roda uma vez:

```
powershell -ExecutionPolicy Bypass -File ferramentas\extrair_ficha.ps1
```

De onde sai cada número: `RaceVehicleChassisConfigData` (massa, entre-eixos,
bitola), `RaceVehicleEngineConfigData` (curva de torque, redline) e
`RaceVehicleTransmissionConfigData` (marchas, relação final, diferencial). A
potência é derivada da curva — `cv = N·m × rpm ÷ 7127`, varrendo de 250 em 250
rpm até o corte.

A curva é uma lista de 10 `Vec3` no formato do Frostbite: `[0]` e `[1]` são os
limites em rpm e em N·m, `[2..9]` são os pontos normalizados.

**Confere com o mundo real:** o M3 E46 sai com 1495 kg e 2,736 m de entre-eixos;
o carro de verdade tem 1495 kg e 2,731 m. Os cavalos são os do jogo, de fábrica —
no Heat o carro começa destravado para baixo e sobe com as peças de performance.

São **146 pastas de ajuste para 168 carros**, com grafias diferentes
(`car_nissan_180sx_typex_1996` contra `car_nissan_180sxtypex_1996`) e variantes
que herdam do carro base. O casamento é por regras em ordem — nome exato, sem
underscore, sem ano, sem sufixo de edição, ficha do doador de peças, prefixo
comum — e **cada carro guarda como casou**, visível no painel. Só um nome precisou
de alias escrito à mão, e está comentado.

Targa e conversível trazem massa própria e nenhum motor: no jogo usam o do cupê.
O código empresta só o motor e mantém a massa deles.

Resultado: **163 dos 168 com motor**. Os cinco de fora são os 2 helicópteros, o
reboque, o caminhão — que não têm configuração de motor — e o 991 GT3, que não tem
pasta de ajuste no jogo. Para esses, a ficha **diz que não tem** em vez de
inventar.

Uma diferença que vale saber: a bitola da física (1.640 mm no M3) não bate com a
meia-bitola do `_rodas_eixos.csv` (740 mm, ou 1.480 de bitola). São medidas
diferentes — a primeira é do modelo de física, a segunda foi ajustada na malha
para a roda cair no arco. O painel mostra as duas, cada uma com seu rótulo.

## A roda: o aro assenta no talão

O erro de fundo estava na premissa, não na conta. O `montar_rodas.py` do acervo
escala o **aro** pelo mesmo fator do **pneu**, supondo que todo aro foi modelado
na mesma referência da malha de pneu compartilhada. Medindo os 166 carros, não
foi: o raio nativo do aro vai de **0,18 a 0,50 m**.

O resultado aparecia assim: no Polestar 1 o aro nativo (0,3163) é do tamanho do
pneu inteiro (0,3165), então a roda saía como um disco liso, sem pneu; no reboque
o aro montava a 0,87 m num pneu de 0,55 e simplesmente atravessava a borracha.

O que vale para qualquer carro é que **o aro assenta no talão do pneu**. Então o
aro é escalado para o raio externo dele cair no raio interno do pneu já escalado,
com 2% de lábio (`rodas.escala_do_aro`). Medido nos 166:

| | pneu aparente |
|---|---|
| regra antiga (fator do pneu) | −317 a 131 mm, **2 carros com o aro atravessando** |
| aro no talão | **65 a 126 mm, nenhum fora da faixa** |

O M3, que já estava certo, vai de 72 para 75 mm — a correção não estraga o que
funcionava. A auditoria roda a qualquer momento:

```
py -3.11 -m nfsgaragem.verificar --rodas
```

## Três coisas menores, na mesma caçada

A roda saía como um disco branco flutuando no arco. Três causas, e só a terceira
era a que enganava:

1. **O composto de pneu padrão vinha da ordem alfabética.** `pneus[0]` é o
   `drift01`, não o `race01` que a montagem de referência (`montar_rodas.py`) usa.
   E o pneu escolhido define a escala do **aro** também — aro e pneu recebem a
   mesma escala, tirada do pneu, porque foram desenhados para casar em tamanho
   nativo. Com o pneu errado, o aro saía 5,7% largo demais.

2. **O pneu não recebia textura nenhuma.** Ele é malha compartilhada e as
   texturas dele estão em `_texturas_rodas/tires/`, não na pasta do carro, então
   a busca por convenção não achava nada. Preto liso sem relevo, dentro de um arco
   escuro, simplesmente some — e sobra o aro cromado, que com ambiente forte
   estoura em branco.

3. **O ETag e a chave do cache eram montados em lugares diferentes** e
   divergiram: o ETag de `/api/pneu/` não incluía o composto. Somado a
   `Cache-Control: private, max-age=3600`, o navegador servia a cópia velha **por
   uma hora sem falar com o servidor** — eu corrigia o servidor e nada mudava na
   tela. Hoje `App.chave_de()` é a função única para os dois, e o binário vai com
   `no-cache` (que significa "guarde, mas pergunte antes de usar", não "não
   guarde"): em loopback a revalidação custa nada e o 304 evita o download.

A máscara `_m` do pneu ficou **de fora** de propósito: ela empacota
metal/suavidade/oclusão e o Three.js lê `roughnessMap` no canal verde, que nesse
formato é suavidade — o inverso do que ele espera. Enquanto o significado dos
canais não estiver medido, melhor sem mapa do que com o mapa errado.

## A quarta causa: o Three descartava o `envMapIntensity`

As três acima eram reais e nenhuma era a principal. A roda continuou errada, e a
causa estava no renderer. O Three r166 faz isto a cada quadro:

```js
if ( material.isMeshStandardMaterial && material.envMap === null
     && scene.environment !== null ) {
    m_uniforms.envMapIntensity.value = scene.environmentIntensity;   // 1.0
}
```

Material que se ilumina por `scene.environment`, sem `envMap` próprio, tem o
`envMapIntensity` dele **trocado por 1.0**, sem erro e sem aviso. E
`MeshPhysicalMaterial` também é `isMeshStandardMaterial`. Resultado: os cinco
valores escritos em `materiais.mjs` — vidro 1,6, pintura 1,4, cromo 1,8, aro 0,6,
pneu 0,12 — nunca chegaram ao shader. O pneu rodava com **8× o ambiente
pretendido** e o aro com 1,7×, que é exatamente um pneu claro demais e um aro
estourado refletindo o LED ciano e a parede magenta da sala.

Medido antes de concluir: zerar o `envMapIntensity` do aro não mudava **um único
byte** do quadro; `cena.environment = null` derrubava o brilho do aro de 131 para
8. Ou seja, 97% da aparência do aro vinha de uma intensidade que o código nunca
escolheu.

A correção é dar ao material o `envMap` dele (`FabricaMateriais` recebe a cena e
faz `m.envMap = cena.environment`), o que faz a condição falhar e devolve o
controle ao arquivo. Depois disso **os números precisaram ser recalibrados**,
porque nenhum deles jamais tinha renderizado: o 0,12 do pneu, ao passar a valer,
apagava a borracha (brilho médio 4,2, sem banda nem parede). Varrendo de 0,08 a
1,0, o valor que dá borracha escura e ainda legível é **0,85**.

Conferido em 10 carros de perfis diferentes (M3, 180SX, 240ZG, 911, Beetle,
Polestar, LaFerrari, Raptor, NSX e uma moto): pneu 28–32 de brilho, aro 75–101,
nenhum fora da faixa, e **zero** material sem `envMap` em qualquer um deles.

`app.mjs` passou a rodar `conferirAmbienteDosMateriais()` depois de cada carga: se
algum material ficar sem `envMap` com a cena tendo ambiente, sai aviso no console
em vez de virar caçada de bug meses depois.

### Como medir aparência sem se enganar

Três armadilhas, todas minhas, encontradas neste mesmo caso:

- **`visible = false` num `Light` apaga a luz.** O `projectObject` do Three pula
  objeto invisível, inclusive luz. Esconder a cena inteira para isolar uma malha
  mede no escuro. Esconder **só** `isMesh`/`isLine`/`isPoints`/`isSprite`.
- **O fundo sentinela vaza na borda.** O antialiasing mistura o pixel de silhueta
  com o fundo e tinge a média — um pneu preto acusou "magenta". Renderizar com
  **dois fundos** diferentes e contar só o pixel que não muda entre os dois.
- **A média esconde a mudança.** Trocar o mapa de normal alterou 83% dos pixels do
  aro em mais de 30 níveis, e a média mal se moveu, porque a luz se redistribui
  sem somar nem sumir. Medir **delta por pixel**, não média.

## A janela e o `js_api`

A janela abria cinza, com "não está respondendo", enquanto o WebView2 por trás
renderizava normalmente — o renderer acumulava CPU e a casca do pywebview ficava
parada em 0,8 s. A causa é a ponte **`js_api`** do `create_window`: o handshake
dela pendura o laço de mensagens nesta combinação de pywebview 6.2.1 com
WebView2 no Windows 11.

Como a página não chama `window.pywebview`, a ponte saiu. A classe `Ponte`
continua no arquivo, pronta para quando houver uso real (salvar imagem, escolher
pasta) — aí precisa voltar por um caminho que não trave, provavelmente
`webview.start(func)` expondo só o necessário.

O `Garagem.bat` cai para o navegador se a janela não subir.

## Idioma

Na **primeira abertura** o app pergunta o idioma, em português e em inglês — é a
única tela que fica nas duas línguas para sempre, porque perguntar "qual idioma?"
num idioma que a pessoa talvez não leia não resolve nada. A escolha fica em
`localStorage` e o rodapé tem um `PT / EN` para trocar a qualquer momento, sem
recarregar.

A pergunta vem **antes** de carregar o acervo de propósito: assim até as mensagens
de progresso saem no idioma escolhido, em vez de piscarem em português e trocarem
no meio.

Os textos moram todos em `static/textos.mjs`, 143 chaves com as duas colunas lado
a lado — espalhar tradução pelos módulos é o jeito garantido de sobrar uma frase
em português numa tela que ninguém abre com frequência. Plural entra como função,
não como marcador: "1 opção"/"2 opções" troca a palavra, e resolver isso no
código de tela espalha gramática onde não deve.

**Separador de número é tradução.** O formatador estava fixo em `pt-BR`; em inglês
`1.495 kg` seria lido como 1,495 — a massa do carro errada por um fator de mil.
Hoje sai de `Intl.NumberFormat` com o local escolhido, e o `lang` do documento
acompanha, que é o que faz leitor de tela escolher a voz certa.

O servidor continua **neutro de idioma**: ele manda o `id` de cada categoria e o
front-end traduz pela chave. Categoria nova sem tradução aparece com o nome que o
servidor mandou, em vez de sumir da trilha.

## Limites conhecidos

- **A ficha é a de fábrica.** O Heat sobe potência com peças de performance, que
  são outro sistema; trocar carroceria não muda cavalo, nem aqui nem no jogo.
- **Sem vinil ainda.** As 258 liveries de fábrica e os 1.691 decalques do acervo
  não são aplicados; o carro sai em cor sólida.
- **Sem salvar projeto.** A montagem vive na sessão.
- Os slots espelhados (para-lamas, retrovisores, portas) são aplicados nos dois
  lados com a mesma variante; quando um lado não tem a peça equivalente, ele fica
  no original.

## Licença

Código: **MIT** (veja `LICENSE`). A licença cobre apenas o código deste
repositório — nada do material do jogo, que continua sendo da Electronic Arts.

O Three.js embarcado em `static/three/` é MIT, do projeto three.js.
