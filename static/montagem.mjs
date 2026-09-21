// Monta o veiculo: corpo, pecas trocadas e rodas.
//
// Toda busca carrega AbortController e contador de geracao. Com 13.834 pecas e
// um carrossel que rola rapido, uma resposta atrasada de A chegando depois de B
// deixaria o carro com peca de outro slot -- o tipo de defeito que so' aparece
// em uso real.

import * as THREE from 'three';
import { buscar, geometrias } from './nfsg.mjs';
import { CacheTexturas, FabricaMateriais } from './materiais.mjs';
import { t } from './idioma.mjs';
import { calcularColocacoes, montarRodas } from './rodas.mjs';

// Compila os shaders do que acabou de entrar na cena **antes** do primeiro
// quadro que os usa. Sem isso, o `render()` seguinte compila tudo de uma vez,
// de forma sincrona: numa janela sem aceleracao de video isso pendura a thread
// por minutos e a janela aparece como "nao está respondendo".
async function compilar(renderer, cena, camera, alvo) {
  if (!renderer || typeof renderer.compileAsync !== 'function') return;
  try {
    // Ordem dos argumentos: `compileAsync(scene, camera, targetScene)`. Estava
    // `(alvo, cena, camera)`, e o erro era silencioso: o Three coletava luz do
    // `targetScene`, que virava a *camera* -- zero luzes -- e passava a camera
    // para `prepareMaterial`, onde `isScene !== true` a troca pelo `_emptyScene`
    // e o `fog` some. Como contagem de luz e fog entram na chave de cache do
    // programa, o `render()` seguinte nao achava nada no cache e recompilava
    // tudo de forma sincrona: exatamente a pendurada que esta funcao existe
    // para evitar. A Promise resolvia sem erro e sem aviso.
    await renderer.compileAsync(alvo, camera, cena);
  } catch {
    // compileAsync nao existe em contexto perdido; o render normal resolve.
  }
}

export class MontadorVeiculo {
  constructor(cena, renderer = null, camera = null) {
    this.renderer = renderer;
    this.camera = camera;
    this.cena = cena;
    this.raiz = new THREE.Group();
    this.raiz.name = 'veiculo';
    cena.add(this.raiz);

    this.carro = null;
    this.ficha = null;
    this.geracao = 0;
    this.abortos = new Map();

    this.texturas = new CacheTexturas();
    this.fabrica = new FabricaMateriais(this.texturas, this.cena);

    this.objetosCorpo = new Map();   // nome do objeto -> Mesh
    this.pecas = new Map();          // slot -> Mesh da peca de modificacao
    this.escolhas = new Map();       // slot -> 'original' | 'nenhuma' | nome da peca
    this.grupoRodas = null;
    this.medidasRodas = null;
  }

  _abortar(rotulo) {
    const a = this.abortos.get(rotulo);
    if (a) a.abort();
    const novo = new AbortController();
    this.abortos.set(rotulo, novo);
    return novo.signal;
  }

  descartar() {
    for (const a of this.abortos.values()) a.abort();
    this.abortos.clear();
    this.raiz.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.raiz.clear();
    this.fabrica.descartar();
    this.texturas.descartar();
    this.texturas = new CacheTexturas();
    this.fabrica = new FabricaMateriais(this.texturas, this.cena);
    this.objetosCorpo.clear();
    this.pecas.clear();
    this.escolhas.clear();
    this.grupoRodas = null;
    this.medidasRodas = null;
  }

  async carregar(carro, ficha, aoProgredir = () => {}) {
    const geracao = ++this.geracao;
    this.descartar();
    this.carro = carro;
    this.ficha = ficha;

    aoProgredir(t('etapa.carroceria'));
    const pacote = await buscar(`/api/carro/${carro}/corpo.bin`, this._abortar('corpo'));
    if (geracao !== this.geracao) return null;

    const specs = pacote.cabecalho.materiais || {};
    // Entra invisivel: o laco de render nao pode tocar nestas malhas antes dos
    // shaders estarem prontos.
    this.raiz.visible = false;
    for (const { nome, geometria, grupos } of geometrias(THREE, pacote)) {
      const mats = grupos.map((g) => this.fabrica.obter(g.material, specs[g.material]));
      const malha = new THREE.Mesh(geometria, mats);
      malha.name = `corpo:${nome}`;
      malha.userData.slot = nome;
      malha.castShadow = true;
      malha.receiveShadow = true;
      this.raiz.add(malha);
      this.objetosCorpo.set(nome, malha);
    }

    aoProgredir(t('etapa.materiais'));
    await compilar(this.renderer, this.cena, this.camera, this.raiz);
    if (geracao !== this.geracao) return null;
    this.raiz.visible = true;

    // Slot aditivo comeca vazio; slot de fabrica comeca no original.
    for (const cat of ficha.categorias || []) {
      for (const s of cat.slots) {
        this.escolhas.set(s.slot, s.tipo === 'adicionar' ? 'nenhuma' : 'original');
      }
    }

    aoProgredir(t('etapa.rodas'));
    await this._montarRodas(geracao, ficha);
    if (geracao !== this.geracao) return null;

    return { pacote, descartes: pacote.cabecalho.descartes || [] };
  }

  async _montarRodas(geracao, ficha) {
    const colocacoes = calcularColocacoes(ficha.rodas);
    if (!colocacoes || !ficha.temRoda) return;
    let pacoteRoda = null;
    let pacotePneu = null;
    try {
      pacoteRoda = await buscar(`/api/carro/${this.carro}/roda.bin`, this._abortar('roda'));
      // `pneus` vem ordenado alfabeticamente, entao `[0]` e' o drift -- e o
      // pneu escolhido define a escala do **aro** tambem. A montagem de
      // referencia (`montar_rodas.py`) usa o race01; seguir ela.
      const composto = ficha.familia === 'moto' ? null
        : (ficha.pneus?.includes('race01') ? 'race01' : ficha.pneus?.[0]);
      if (composto) {
        pacotePneu = await buscar(`/api/pneu/${composto}.bin`, this._abortar('pneu'));
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('rodas indisponiveis:', e.message);
      return;
    }
    if (geracao !== this.geracao) return;

    const { grupo, medidas } = montarRodas({
      pacoteRoda, pacotePneu, colocacoes, fabrica: this.fabrica,
    });
    grupo.visible = false;
    this.grupoRodas = grupo;
    this.medidasRodas = medidas;
    this.raiz.add(grupo);
    await compilar(this.renderer, this.cena, this.camera, grupo);
    if (geracao !== this.geracao) return;
    grupo.visible = true;
  }

  slotsDoPar(slot) {
    const achar = (nome) => {
      for (const cat of this.ficha?.categorias || []) {
        const s = cat.slots.find((x) => x.slot === nome);
        if (s) return s;
      }
      return null;
    };
    const s = achar(slot);
    return s?.espelho ? [slot, s.espelho] : [slot];
  }

  // Troca a peca de um slot. `escolha` e' 'original', 'nenhuma' ou o nome do
  // arquivo da variante (sem .obj).
  async escolher(slot, escolha, { aoErro = () => {} } = {}) {
    const geracao = this.geracao;
    const alvos = this.slotsDoPar(slot);
    this.escolhas.set(slot, escolha);

    for (const alvo of alvos) {
      const antiga = this.pecas.get(alvo);
      const doCorpo = this.objetosCorpo.get(alvo);

      if (escolha === 'original' || escolha === 'nenhuma') {
        if (antiga) {
          antiga.geometry.dispose();
          this.raiz.remove(antiga);
          this.pecas.delete(alvo);
        }
        if (doCorpo) doCorpo.visible = escolha === 'original';
        continue;
      }

      // O par espelhado usa o mesmo nome de variante do outro lado; se nao
      // existir, o lado fica no original em vez de sumir.
      const nome = alvo === slot ? escolha : escolha.replace(slot, alvo);
      let pacote;
      try {
        pacote = await buscar(
          `/api/carro/${this.carro}/peca/${alvo}/${nome}.bin`,
          this._abortar(`peca:${alvo}`));
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (alvo === slot) { aoErro(e); return; }
        continue; // lado espelhado sem variante equivalente
      }
      if (geracao !== this.geracao) return;

      const specs = pacote.cabecalho.materiais || {};
      const grupo = new THREE.Group();
      grupo.name = `peca:${alvo}:${nome}`;
      for (const { geometria, grupos } of geometrias(THREE, pacote)) {
        const mats = grupos.map((g) => this.fabrica.obter(g.material, specs[g.material]));
        const malha = new THREE.Mesh(geometria, mats);
        malha.castShadow = true;
        malha.receiveShadow = true;
        grupo.add(malha);
      }

      grupo.visible = false;
      this.raiz.add(grupo);
      await compilar(this.renderer, this.cena, this.camera, grupo);
      if (geracao !== this.geracao) { this.raiz.remove(grupo); return; }

      // So' agora troca: assim nao ha um quadro com o slot vazio.
      if (doCorpo) doCorpo.visible = false;
      if (antiga) {
        antiga.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.raiz.remove(antiga);
      }
      grupo.visible = true;
      this.pecas.set(alvo, grupo);
    }
  }

  caixa() {
    // Sem atualizar a matriz de mundo a caixa sai do tamanho certo mas na
    // posicao errada -- as rodas ficam dentro de um Group com escala propria.
    this.raiz.updateWorldMatrix(true, true);
    const caixa = new THREE.Box3();
    this.raiz.traverse((o) => {
      if (o.isMesh && o.visible) caixa.expandByObject(o);
    });
    return caixa.isEmpty() ? null : caixa;
  }

  triangulos() {
    let total = 0;
    this.raiz.traverse((o) => {
      if (o.isMesh && o.visible && o.geometry?.index) {
        total += o.geometry.index.count / 3;
      }
    });
    return Math.round(total);
  }

  pecasTrocadas() {
    let n = 0;
    for (const [slot, escolha] of this.escolhas) {
      const original = this.ficha?.categorias
        ?.flatMap((c) => c.slots).find((s) => s.slot === slot);
      const padrao = original?.tipo === 'adicionar' ? 'nenhuma' : 'original';
      if (escolha !== padrao) n++;
    }
    return n;
  }
}
