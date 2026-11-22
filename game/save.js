// SOLMARIS — save / economy: localStorage persistence + shop catalogue.
const KEY = 'solmaris_save_v11';

export const SHOP_ITEMS = [
  { id: 'car_sport', name: 'Comet Sportscar', desc: 'Top speed +60%, sharp handling. Parked at garage.', price: 2500, kind: 'car', color: '#ff2e63', topSpeed: 560 },
  { id: 'car_muscle', name: 'Sabre Muscle Car', desc: 'Heavy, fast, great ram damage. Parked at garage.', price: 1800, kind: 'car', color: '#ff9d2e', topSpeed: 500 },
  { id: 'car_taxi', name: 'Cabbie Taxi', desc: 'Sturdy city cruiser. Parked at garage.', price: 900, kind: 'car', color: '#ffd23e', topSpeed: 430 },
  { id: 'up_engine', name: 'Engine Tuning Lv.1', desc: '+25% top speed on every car you drive.', price: 1200, kind: 'upgrade', stat: 'engine' },
  { id: 'up_engine2', name: 'Engine Tuning Lv.2', desc: '+25% more top speed. Needs Lv.1.', price: 2200, kind: 'upgrade', stat: 'engine2', needs: 'up_engine' },
  { id: 'up_armor', name: 'Body Armor Plating', desc: 'Cars take 40% less damage, health drains slower.', price: 1000, kind: 'upgrade', stat: 'armor' },
  { id: 'up_health', name: 'Kevlar Vest', desc: '+50 max health, heal faster.', price: 800, kind: 'upgrade', stat: 'health' },
];

export function defaultSave() {
  return {
    money: 500,
    owned: ['car_sedan'],
    upgrades: [],
    missionsDone: {},
    bestTimes: {},
    totalEarned: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const d = defaultSave();
    return { ...d, ...data, owned: Array.isArray(data.owned) ? data.owned : d.owned, upgrades: Array.isArray(data.upgrades) ? data.upgrades : d.upgrades, missionsDone: data.missionsDone || {}, bestTimes: data.bestTimes || {} };
  } catch (e) { return defaultSave(); }
}

export function storeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage may be unavailable */ }
}

export function hasUpgrade(save, id) { return save.upgrades.includes(id); }
export function engineMultiplier(save) {
  let m = 1;
  if (hasUpgrade(save, 'up_engine')) m += 0.25;
  if (hasUpgrade(save, 'up_engine2')) m += 0.25;
  return m;
}
export function maxHealth(save) { return hasUpgrade(save, 'up_health') ? 150 : 100; }
export function armorFactor(save) { return hasUpgrade(save, 'up_armor') ? 0.6 : 1; }

export function buyItem(save, item) {
  if (save.money < item.price) return { ok: false, reason: 'Not enough cash.' };
  if (item.kind === 'car' && save.owned.includes(item.id)) return { ok: false, reason: 'Already owned.' };
  if (item.kind === 'upgrade' && save.upgrades.includes(item.id)) return { ok: false, reason: 'Already owned.' };
  if (item.needs && !save.upgrades.includes(item.needs)) return { ok: false, reason: 'Buy ' + item.needs.replace('up_', '').toUpperCase() + ' first.' };
  save.money -= item.price;
  if (item.kind === 'car') save.owned.push(item.id);
  else save.upgrades.push(item.id);
  storeSave(save);
  return { ok: true };
}
