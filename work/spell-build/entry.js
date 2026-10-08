import nspell from 'nspell';
import affBase64 from './node_modules/dictionary-ru/index.aff';
import dicBase64 from './node_modules/dictionary-ru/index.dic';

let instance;
function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

globalThis.typografSpell = {
  ready() {
    if (!instance) instance = nspell(decode(affBase64), decode(dicBase64));
    return instance;
  },
};
