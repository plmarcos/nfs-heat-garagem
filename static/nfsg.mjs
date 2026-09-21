// Decodificador do formato NFSG1. Devolve views sobre o ArrayBuffer, nao
// copias: um corpo de 2,9 MB nao precisa ser duplicado na memoria para virar
// BufferAttribute.

const MAGICO = 0x4753464e; // "NFSG" em little-endian

export class ErroNfsg extends Error {}

export function decodificar(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) {
    throw new ErroNfsg('payload vazio ou curto demais');
  }
  const vista = new DataView(buffer);
  if (vista.getUint32(0, true) !== MAGICO) {
    throw new ErroNfsg('assinatura NFSG ausente');
  }
  const versao = vista.getUint32(4, true);
  if (versao !== 1) throw new ErroNfsg(`versao NFSG ${versao} desconhecida`);
  const bytesCabecalho = vista.getUint32(8, true);
  if (16 + bytesCabecalho > buffer.byteLength) {
    throw new ErroNfsg('cabecalho maior que o arquivo');
  }
  const texto = new TextDecoder('utf-8').decode(
    new Uint8Array(buffer, 16, bytesCabecalho));
  let cabecalho;
  try {
    cabecalho = JSON.parse(texto);
  } catch (e) {
    throw new ErroNfsg('cabecalho JSON invalido');
  }
  const base = 16 + bytesCabecalho;
  return { cabecalho, base, buffer };
}

function fatia(pacote, registro, Tipo) {
  if (!registro) return null;
  const { off, len } = registro;
  const inicio = pacote.base + off;
  if (off % 4 !== 0) throw new ErroNfsg('buffer desalinhado');
  if (inicio + len > pacote.buffer.byteLength) {
    throw new ErroNfsg('buffer alem do fim do arquivo');
  }
  return new Tipo(pacote.buffer, inicio, len / Tipo.BYTES_PER_ELEMENT);
}

// Monta uma BufferGeometry por objeto do pacote. THREE e' injetado para o
// modulo continuar testavel sem WebGL.
export function geometrias(THREE, pacote) {
  return pacote.cabecalho.objetos.map((obj) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(
      fatia(pacote, obj.pos, Float32Array), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(
      fatia(pacote, obj.nrm, Float32Array), 3));
    if (obj.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(
        fatia(pacote, obj.uv, Float32Array), 2));
    }
    g.setIndex(new THREE.BufferAttribute(fatia(pacote, obj.idx, Uint32Array), 1));
    obj.grupos.forEach((grupo, i) => g.addGroup(grupo.inicio, grupo.contagem, i));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return { nome: obj.nome, geometria: g, grupos: obj.grupos, limites: obj.limites };
  });
}

// Carimbo de versao em todo binario. O cache do navegador guarda por URL, e a
// janela de desktop tem o cache dela, separado do navegador: sem isso, uma
// correcao no servidor pode nao aparecer na janela por horas -- foi o que
// aconteceu, e me fez caçar um bug que eu ja' tinha corrigido.
let _versao = '';
export function carimbarVersao(v) { _versao = v ? String(v) : ''; }

export async function buscar(url, sinal) {
  if (_versao) url += (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(_versao);
  const r = await fetch(url, { signal: sinal });
  if (!r.ok) {
    let detalhe = r.statusText;
    try { detalhe = (await r.json()).erro || detalhe; } catch { /* corpo nao-JSON */ }
    throw new ErroNfsg(`${url}: ${detalhe}`);
  }
  return decodificar(await r.arrayBuffer());
}
