// A sala. Showroom escuro no espirito do Heat, nao oficina rustica: piso
// polido que reflete, parede de nervura, LED ciano nas calhas e uma lavada
// magenta ao fundo. Tudo procedural -- nenhuma textura vem de arquivo, entao a
// sala funciona mesmo sem nada instalado alem do proprio app.

import * as THREE from 'three';

const LARGURA = 16;
const PROFUNDIDADE = 20;
const ALTURA = 5.4;

// LCG deterministico: a sala tem que sair igual toda vez, senao comparar dois
// renders para achar regressao vira adivinhacao.
function gerador(semente = 20260921) {
  let s = semente >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function textura(w, h, desenhar, rx = 1, ry = 1, renderer = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  desenhar(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function caixa(w, h, d, material, x = 0, y = 0, z = 0, nome = '') {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  if (nome) m.name = nome;
  return m;
}

export function criarGaragem(root, renderer) {
  const rnd = gerador();
  const grupo = new THREE.Group();
  grupo.name = 'garagem';

  // -- piso: concreto polido escuro, com sujeira sutil ---------------------
  const mapaPiso = textura(1024, 1024, (c, w, h) => {
    c.fillStyle = '#15191d'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      c.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.028)' : 'rgba(0,0,0,.05)';
      c.fillRect(rnd() * w, rnd() * h, rnd() * 4 + 1, rnd() * 2 + 1);
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 170;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(10,13,16,.20)');
      g.addColorStop(1, 'rgba(10,13,16,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // junta de dilatacao
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3;
    c.strokeRect(0, 0, w, h);
  }, 4, 5, renderer);

  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(LARGURA, PROFUNDIDADE),
    new THREE.MeshStandardMaterial({
      color: 0x30363c, roughness: .18, metalness: .55,
      map: mapaPiso, envMapIntensity: 1.1,
    }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  piso.name = 'piso';
  grupo.add(piso);

  // Faixa de demarcacao da baia, pintada no piso.
  const faixa = new THREE.MeshBasicMaterial({ color: 0x1d5f6d, transparent: true, opacity: .5 });
  for (const x of [-2.6, 2.6]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.07, 7.4), faixa);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, .003, 0);
    grupo.add(m);
  }

  // -- paredes -------------------------------------------------------------
  const mapaNervura = textura(512, 256, (c, w, h) => {
    c.fillStyle = '#0d1114'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      c.fillStyle = 'rgba(255,255,255,.045)'; c.fillRect(x, 0, 2, h);
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(x + 10, 0, 5, h);
    }
  }, 10, 3, renderer);

  const matParede = new THREE.MeshStandardMaterial({
    color: 0x1a2026, roughness: .78, metalness: .12, map: mapaNervura,
  });
  const matLisa = new THREE.MeshStandardMaterial({ color: 0x141a1f, roughness: .85 });

  const fundo = caixa(LARGURA, ALTURA, .3, matParede, 0, ALTURA / 2, -PROFUNDIDADE / 2, 'parede_fundo');
  fundo.receiveShadow = true;
  grupo.add(fundo);
  grupo.add(caixa(.3, ALTURA, PROFUNDIDADE, matLisa, -LARGURA / 2, ALTURA / 2, 0, 'parede_esq'));
  grupo.add(caixa(.3, ALTURA, PROFUNDIDADE, matLisa, LARGURA / 2, ALTURA / 2, 0, 'parede_dir'));
  grupo.add(caixa(LARGURA, .3, PROFUNDIDADE, matLisa, 0, ALTURA, 0, 'teto'));

  // -- pilares (nome column_* para a oclusao de camera reconhecer) ----------
  const matAco = new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: .5, metalness: .8 });
  for (const x of [-LARGURA / 2 + 1.1, LARGURA / 2 - 1.1]) {
    for (const z of [-5.5, 2.5]) {
      const p = caixa(.34, ALTURA, .34, matAco, x, ALTURA / 2, z, `column_${x}_${z}`);
      p.castShadow = true;
      grupo.add(p);
    }
  }

  // -- LED: calhas de teto e uma no piso -----------------------------------
  const led = (cor, intensidade) => new THREE.MeshBasicMaterial({
    color: cor, toneMapped: false,
  });

  const fitas = new THREE.Group();
  fitas.name = 'leds';
  for (const x of [-4.2, 4.2]) {
    const f = caixa(.1, .07, PROFUNDIDADE - 2.4, led(0x00e5ff), x, ALTURA - .42, 0);
    fitas.add(f);
    const luz = new THREE.RectAreaLight ? null : null; // evitado: custa caro
  }
  // fita rente ao piso, do lado do motorista
  fitas.add(caixa(.07, .05, 9, led(0x00e5ff), -LARGURA / 2 + .42, .06, 0));
  grupo.add(fitas);

  // Lavada magenta na parede do fundo.
  const lavada = new THREE.Mesh(
    new THREE.PlaneGeometry(LARGURA - 1.2, 2.6),
    new THREE.MeshBasicMaterial({
      color: 0xff2d78, transparent: true, opacity: .07, toneMapped: false,
    }));
  lavada.position.set(0, 1.5, -PROFUNDIDADE / 2 + .18);
  grupo.add(lavada);

  // -- softboxes: e' o que a pintura reflete -------------------------------
  const matSoft = new THREE.MeshBasicMaterial({ color: 0xdfe9f2, toneMapped: false });
  const softs = [];
  for (const x of [-2.5, 2.5]) {
    for (const z of [-2.6, 2.4]) {
      const s = caixa(2.0, .06, 1.2, matSoft, x, ALTURA - .5, z);
      grupo.add(s);
      softs.push(s);
    }
  }

  // -- porta de enrolar em vidro, com brilho de cidade ----------------------
  const mapaCidade = textura(512, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#071018'); g.addColorStop(.55, '#0d2231'); g.addColorStop(1, '#132c3d');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 34; i++) {
      const bw = 14 + rnd() * 34, bh = 30 + rnd() * 130;
      const x = rnd() * w, y = h - bh;
      c.fillStyle = `rgba(6,12,18,${.55 + rnd() * .3})`;
      c.fillRect(x, y, bw, bh);
      for (let jy = y + 5; jy < h - 6; jy += 9) {
        for (let jx = x + 4; jx < x + bw - 4; jx += 7) {
          if (rnd() > .62) {
            c.fillStyle = rnd() > .82 ? 'rgba(255,176,32,.75)' : 'rgba(0,229,255,.5)';
            c.fillRect(jx, jy, 3, 4);
          }
        }
      }
    }
  }, 1, 1, renderer);

  const portao = new THREE.Mesh(
    new THREE.PlaneGeometry(LARGURA - 2.4, 3.4),
    new THREE.MeshBasicMaterial({ map: mapaCidade, toneMapped: false }));
  portao.position.set(0, 1.9, PROFUNDIDADE / 2 - .22);
  portao.rotation.y = Math.PI;
  portao.name = 'portao';
  grupo.add(portao);

  // ripas da porta, por cima do brilho
  const matRipa = new THREE.MeshStandardMaterial({
    color: 0x0b1015, roughness: .6, metalness: .5, transparent: true, opacity: .55,
  });
  for (let y = .25; y < 3.5; y += .42) {
    grupo.add(caixa(LARGURA - 2.4, .05, .05, matRipa, 0, y, PROFUNDIDADE / 2 - .26));
  }

  // -- mobilia em silhueta: le como profundidade, nao como bagunca ---------
  const matEscuro = new THREE.MeshStandardMaterial({ color: 0x10161b, roughness: .8 });
  const bancada = new THREE.Group();
  bancada.add(caixa(4.4, .09, .8, matEscuro, 0, .92, 0));
  bancada.add(caixa(4.4, .9, .06, matEscuro, 0, .46, -.36));
  for (const x of [-2.0, 0, 2.0]) bancada.add(caixa(.08, .9, .7, matEscuro, x, .46, 0));
  bancada.position.set(-LARGURA / 2 + 2.8, 0, -PROFUNDIDADE / 2 + 1.1);
  grupo.add(bancada);

  // painel de ferramenta
  const painel = caixa(3.2, 1.5, .06, new THREE.MeshStandardMaterial({
    color: 0x0c1116, roughness: .75,
  }), -LARGURA / 2 + 2.8, 2.1, -PROFUNDIDADE / 2 + .7);
  grupo.add(painel);

  // suporte de rodas
  const rack = new THREE.Group();
  const matPneuRack = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: .9 });
  for (let p = 0; p < 3; p++) {
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(.33, .115, 8, 22), matPneuRack);
      t.rotation.y = Math.PI / 2;
      t.position.set(0, .5 + p * .82, -1 + i * 1);
      rack.add(t);
    }
    rack.add(caixa(.7, .05, 3.2, matEscuro, 0, .1 + p * .82, 0));
  }
  rack.position.set(LARGURA / 2 - 1.1, 0, -4.5);
  grupo.add(rack);

  // -- poeira: so' um sopro, para o ar nao parecer vazio -------------------
  const nPo = 90;
  const posPo = new Float32Array(nPo * 3);
  for (let i = 0; i < nPo; i++) {
    posPo[i * 3] = (rnd() - .5) * 12;
    posPo[i * 3 + 1] = rnd() * 3.4 + .3;
    posPo[i * 3 + 2] = (rnd() - .5) * 13;
  }
  const geoPo = new THREE.BufferGeometry();
  geoPo.setAttribute('position', new THREE.BufferAttribute(posPo, 3));
  const po = new THREE.Points(geoPo, new THREE.PointsMaterial({
    color: 0x9fd4e0, size: .022, transparent: true, opacity: .32, depthWrite: false,
  }));
  po.name = 'poeira';
  grupo.add(po);

  root.add(grupo);

  // -- luzes ---------------------------------------------------------------
  const luzes = new THREE.Group();
  luzes.name = 'luzes';

  const ambiente = new THREE.HemisphereLight(0x8fbfd6, 0x0a0e12, .45);
  luzes.add(ambiente);

  const principal = new THREE.DirectionalLight(0xdfeaf5, 2.2);
  principal.position.set(-4.5, 7.5, 4.5);
  principal.castShadow = true;
  principal.shadow.mapSize.set(2048, 2048);
  principal.shadow.camera.near = 1;
  principal.shadow.camera.far = 26;
  principal.shadow.camera.left = -7;
  principal.shadow.camera.right = 7;
  principal.shadow.camera.top = 7;
  principal.shadow.camera.bottom = -7;
  principal.shadow.bias = -.00035;
  principal.shadow.radius = 3;
  luzes.add(principal);

  const contra = new THREE.DirectionalLight(0x00e5ff, .85);
  contra.position.set(5.5, 3.2, -6);
  luzes.add(contra);

  const preenche = new THREE.DirectionalLight(0xff2d78, .35);
  preenche.position.set(3.5, 1.6, 6.5);
  luzes.add(preenche);

  for (const x of [-2.5, 2.5]) {
    for (const z of [-2.6, 2.4]) {
      const p = new THREE.PointLight(0xdfe9f2, 9, 8, 2.1);
      p.position.set(x, ALTURA - .7, z);
      luzes.add(p);
    }
  }

  root.add(luzes);

  let tempoPo = 0;
  return {
    grupo,
    luzes,
    principal,
    softs,
    limites: {
      x: [-LARGURA / 2 + .8, LARGURA / 2 - .8],
      y: [.25, ALTURA - .5],
      z: [-PROFUNDIDADE / 2 + .8, PROFUNDIDADE / 2 - .8],
    },
    atualizar(dt) {
      tempoPo += dt;
      const arr = geoPo.getAttribute('position');
      for (let i = 0; i < nPo; i++) {
        arr.array[i * 3 + 1] += Math.sin(tempoPo * .35 + i) * .00035;
      }
      arr.needsUpdate = true;
    },
  };
}
