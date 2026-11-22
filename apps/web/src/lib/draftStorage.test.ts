import { describe, it, expect } from 'vitest';
import {
  bindDraftsToUser,
  boundUser,
  isForeignUserKey,
  lockDrafts,
  readStored,
  removeStored,
  storageKey,
  unbindDrafts,
  writeStored,
} from './draftStorage';

// test-setup.ts снимает привязку и чистит localStorage после каждого теста.
describe('draftStorage', () => {
  it('без привязки ключи прежние', () => expect(storageKey('ladungsplaner.setup')).toBe('ladungsplaner.setup'));

  it('без привязки чтение, запись и удаление идут по прежним ключам', () => {
    writeStored('ladungsplaner.load', 'L');
    expect(localStorage.getItem('ladungsplaner.load')).toBe('L');
    expect(readStored('ladungsplaner.load')).toBe('L');
    removeStored('ladungsplaner.load');
    expect(localStorage.getItem('ladungsplaner.load')).toBeNull();
    expect(boundUser()).toBeNull();
    // Обычная сборка под USER_PREFIX не пишет — любой пользовательский ключ ей чужой.
    expect(isForeignUserKey('ladungsplaner.u.anna%40firma.de.setup')).toBe(true);
  });

  it('два сотрудника на одном компьютере: чужой и безымянный черновики удаляются', () => {
    localStorage.setItem('ladungsplaner.setup', '{"anon":1}');
    localStorage.setItem('ladungsplaner.u.anna%40firma.de.setup', '{"anna":1}');
    localStorage.setItem('ladungsplaner.u.anna%40firma.de.showTruck', 'false');
    bindDraftsToUser('boris@firma.de');
    expect(localStorage.getItem('ladungsplaner.setup')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.setup')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.showTruck')).toBeNull();
    expect(readStored('ladungsplaner.setup')).toBeNull();
    writeStored('ladungsplaner.setup', '{"boris":1}');
    expect(localStorage.getItem('ladungsplaner.u.boris%40firma.de.setup')).toBe('{"boris":1}');
  });

  it('удаляются все безымянные черновики, а не только setup; чужие ключи вне программы не трогаются', () => {
    for (const k of ['ladungsplaner.setup', 'ladungsplaner.load', 'ladungsplaner.orderColors', 'ladungsplaner.strategy', 'ladungsplaner.planContext']) {
      localStorage.setItem(k, 'x');
    }
    localStorage.setItem('other.app', 'keep');
    bindDraftsToUser('boris@firma.de');
    for (const k of ['ladungsplaner.setup', 'ladungsplaner.load', 'ladungsplaner.orderColors', 'ladungsplaner.strategy', 'ladungsplaner.planContext']) {
      expect(localStorage.getItem(k)).toBeNull();
    }
    expect(localStorage.getItem('other.app')).toBe('keep');
  });

  it('свой черновик сохраняется при повторном входе того же пользователя', () => {
    localStorage.setItem('ladungsplaner.u.boris%40firma.de.load', 'L');
    bindDraftsToUser('boris@firma.de');
    expect(localStorage.getItem('ladungsplaner.u.boris%40firma.de.load')).toBe('L');
    expect(readStored('ladungsplaner.load')).toBe('L');
    expect(boundUser()).toBe('boris@firma.de');
  });

  it('имя пользователя, начинающееся с имени другого и точки, — другой пользователь', () => {
    // encodeURIComponent не кодирует «.»: ключ пользователя `anna.x` начинается с префикса `anna.`.
    localStorage.setItem('ladungsplaner.u.anna.x.setup', 'X');
    bindDraftsToUser('anna');
    expect(localStorage.getItem('ladungsplaner.u.anna.x.setup')).toBeNull();
    expect(isForeignUserKey('ladungsplaner.u.anna.x.setup')).toBe(true);
    expect(isForeignUserKey('ladungsplaner.u.anna.setup')).toBe(false);
  });

  it('после lockDrafts старая вкладка ничего не пишет и не удаляет', () => {
    bindDraftsToUser('anna@firma.de');
    writeStored('ladungsplaner.setup', 'A1');
    lockDrafts();
    writeStored('ladungsplaner.setup', 'A2');
    removeStored('ladungsplaner.setup');
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.setup')).toBe('A1');
    expect(isForeignUserKey('ladungsplaner.u.boris%40firma.de.setup')).toBe(true);
    expect(isForeignUserKey('ladungsplaner.u.anna%40firma.de.setup')).toBe(false);
    expect(isForeignUserKey(null)).toBe(false);
  });

  it('ключ вне USER_PREFIX чужим не считается', () => {
    bindDraftsToUser('anna@firma.de');
    expect(isForeignUserKey('ladungsplaner.setup')).toBe(false);
    expect(isForeignUserKey('other.app')).toBe(false);
  });

  it('unbindDrafts снимает и привязку, и блокировку', () => {
    bindDraftsToUser('anna@firma.de');
    lockDrafts();
    unbindDrafts();
    expect(boundUser()).toBeNull();
    writeStored('ladungsplaner.setup', 'S');
    expect(localStorage.getItem('ladungsplaner.setup')).toBe('S');
  });

  it('новая привязка снимает блокировку', () => {
    bindDraftsToUser('anna@firma.de');
    lockDrafts();
    bindDraftsToUser('anna@firma.de');
    writeStored('ladungsplaner.setup', 'A3');
    expect(localStorage.getItem('ladungsplaner.u.anna%40firma.de.setup')).toBe('A3');
  });

  it('настройки вида после привязки тоже под пользователем', () => {
    bindDraftsToUser('boris@firma.de');
    writeStored('ladungsplaner.showTruck', 'false');
    expect(localStorage.getItem('ladungsplaner.showTruck')).toBeNull();
    expect(localStorage.getItem('ladungsplaner.u.boris%40firma.de.showTruck')).toBe('false');
  });
});
