// Loading .glb models. Some hosts will not serve .glb files; for those the build packs each
// model into a JSON file as base64, and sets `GLOAM_PACKED` so we read that instead.
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const packed = () => (globalThis as { GLOAM_PACKED?: boolean }).GLOAM_PACKED === true;

export async function loadGlb(url: string): Promise<GLTF> {
  const loader = new GLTFLoader();
  if (!packed()) return loader.loadAsync(url);
  const res = await fetch(url + '.json');
  if (!res.ok) throw new Error(`missing ${url}.json`);
  const { data } = (await res.json()) as { data: string };
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, '');
}
