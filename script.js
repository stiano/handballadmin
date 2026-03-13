
// ---------- Hjelpefunksjoner ----------
const uniq = arr => Array.from(new Set(arr.map(s => s.trim()).filter(Boolean)));
const splitList = (txt) => uniq(txt.replaceAll(",", "
").split(/?
/));
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

function parseInputs(){
  const players = splitList(document.getElementById('players').value);
  let keepers = splitList(document.getElementById('keeperWish').value);
  if(keepers.length===0) keepers = [...players];

  // Filtrer keepers som faktisk er i spillerlista
  keepers = keepers.filter(k => players.includes(k));

  const games = clamp(parseInt(document.getElementById('games').value||'0',10),1,999);
  const minutes = clamp(parseInt(document.getElementById('minutes').value||'0',10),1,999);
  const avoidConsecutive = document.getElementById('avoidConsecutive').checked;
  const strictBalance = document.getElementById('strictBalance').checked;

  return {players, keepers, games, minutes, avoidConsecutive, strictBalance};
}

function showMessage(html){
  const out = document.getElementById('output');
  out.style.display = 'block';
  out.innerHTML = html;
}

function renderPlan(model){
  const {players, keepers, games, minutes, slots, assignment, totals} = model;
  const halfMin = Math.floor(minutes/2);
  let html = '';

  html += `<div class="flex">
    <span class="tag">Spillere: <strong>${players.length}</strong></span>
    <span class="tag">Villige keepere: <strong>${keepers.length}</strong></span>
    <span class="tag">Kamper: <strong>${games}</strong></span>
    <span class="tag">Min/kamp: <strong>${minutes}</strong> (≈ ${halfMin} pr. omgang)</span>
    <span class="right small hint">Alternativ B: To omganger pr. kamp, én keeperbytte.</span>
  </div>
  <div class="sep"></div>`;

  // Per kamp
  html += `<div class="grid">`;
  for(let g=1; g<=games; g++){
    const k1 = assignment.find(a=>a.game===g && a.half===1)?.keeper || '—';
    const k2 = assignment.find(a=>a.game===g && a.half===2)?.keeper || '—';
    const warn = (k1==='—' || k2==='—') ? 'warning' : '';
    html += `<div class="game">
      <h4>Kamp ${g}</h4>
      <div class="flex">
        <span class="pill">1. omg: <strong>${k1}</strong></span>
        <span class="pill">2. omg: <strong>${k2}</strong></span>
      </div>
      ${warn?`<div class="small ${warn}" style="margin-top:8px;">Kunne ikke fullføre begge omgangene uten å bryte reglene.</div>`:''}
    </div>`;
  }
  html += `</div>`;

  // Totaltid for keeper
  html += `<div class="sep"></div>
    <h3 style="margin:0 0 8px 0;">Keeperminutter pr. spiller</h3>
    <table><thead>
      <tr><th>Spiller</th><th>Keeper‑omganger</th><th>Keeper‑minutter</th></tr>
    </thead><tbody>`;
  players.forEach(p=>{
    const halfs = totals[p]||0;
    html += `<tr><td>${p}</td><td>${halfs}</td><td>${halfs*halfMin}</td></tr>`;
  });
  html += `</tbody></table>`;

  // Fordelingsindikator
  const vals = players.map(p=>totals[p]||0);
  const max = Math.max(...vals), min = Math.min(...vals);
  const ok = max-min<=1;
  html += `<div class="small ${ok?'success':'warning'}" style="margin-top:8px;">
    Fordeling av keeper‑omganger: min=${min}, max=${max} ${ok?'(±1 OK)':'(krever lemping pga. regler / få keepere)'}
  </div>`;

  showMessage(html);
}

// ---------- Keeperplan-algoritme (Alternativ B) ----------
/**
 * Regler:
 *  - Hver kamp har to omganger => to keeper-slots.
 *  - Ingen kan være keeper begge omganger i samme kamp.
 *  - (Valgfritt) Ingen skal være keeper i to kamper på rad (defineres per kamp; om du var keeper i 1. eller 2. omgang i kamp k,
 *    kan du ikke være keeper i kamp k+1).
 *  - Fordeling skal være så jevn som mulig (±1 hvis mulig).
 *
 * Strategi (rettferdighets-patch):
 *  1) Beregn mål-antall slots per villig keeper (jevnest mulig fordeling av 2*kamper).
 *  2) Greedy tildeling per kamp/omgang med prioritering:
 *     - Kandidater som ikke bryter reglene for denne slotten.
 *     - Under target først (strictBalance), deretter færrest tildelte totalt.
 *  3) Lemping: hvis låsning, slipp "ikke på rad"-regelen, men aldri to omganger i samme kamp.
 */
function buildPlanB({players, keepers, games, minutes, avoidConsecutive, strictBalance}){
  const slots = [];
  for(let g=1; g<=games; g++){
    slots.push({game:g, half:1});
    slots.push({game:g, half:2});
  }

  // Målfordeling kun over villige keepere
  const totalSlots = slots.length;
  const K = Math.max(keepers.length, 1);
  const base = Math.floor(totalSlots / K);
  const remainder = totalSlots % K;
  const target = {};
  keepers.forEach((k,i)=> target[k] = base + (i < remainder ? 1 : 0));

  const assign = [];
  const usedInGame = new Map(); // game -> Set(keeper)
  const assignedCount = {}; players.forEach(p=>assignedCount[p]=0);

  function consecBlocked(name, game){
    if(!avoidConsecutive) return false;
    const prev = assign.find(a => a.game===game-1 && a.keeper===name);
    return !!prev;
  }

  function candidateList(game){
    const used = usedInGame.get(game) || new Set();
    let cands = keepers.filter(k => !used.has(k));
    if(avoidConsecutive) cands = cands.filter(k => !consecBlocked(k, game));
    return cands;
  }

  function pickCandidate(cands){
    if(cands.length===0) return null;
    const score = (k)=>[
      // 1) Under target først hvis strictBalance brukes
      (typeof target[k]==='number' ? (assignedCount[k] < target[k] ? 0 : 1) : 0),
      // 2) Færrest tildelte
      assignedCount[k]
    ];
    cands.sort((a,b)=>{
      const sa = score(a), sb = score(b);
      if(sa[0]!==sb[0]) return sa[0]-sb[0];
      if(sa[1]!==sb[1]) return sa[1]-sb[1];
      return 0;
    });
    return cands[0];
  }

  for(const s of slots){
    const used = usedInGame.get(s.game) || new Set();
    let cands = candidateList(s.game);

    if(strictBalance){
      const under = cands.filter(k => typeof target[k]==='number' ? assignedCount[k] < target[k] : true);
      if(under.length>0) cands = under;
    }

    let pick = pickCandidate(cands);

    if(!pick){
      // Lemping 1: Ignorer consecutive-regelen
      let relaxed = keepers.filter(k=>!used.has(k));
      if(strictBalance){
        const under2 = relaxed.filter(k => typeof target[k]==='number' ? assignedCount[k] < target[k] : true);
        if(under2.length>0) relaxed = under2;
      }
      pick = pickCandidate(relaxed);
    }

    if(!pick){
      // Lemping 2: Ta fra spillere (som ikke nødvendigvis er villige) for å få plan
      let any = players.filter(p=>!used.has(p));
      any.sort((a,b)=> (assignedCount[a]??0)-(assignedCount[b]??0));
      pick = any[0] || null;
    }

    assign.push({game:s.game, half:s.half, keeper: pick || '—'});
    if(pick){
      used.add(pick);
      usedInGame.set(s.game, used);
      assignedCount[pick] = (assignedCount[pick]||0)+1;
    }
  }

  const totals = {}; players.forEach(p=> totals[p]=assignedCount[p]||0);

  return {players, keepers, games, minutes, slots, assignment: assign, totals};
}

// ---------- Keeper-skade / hurtigreparasjon ----------
function repairInjury(model, game, half, injuredName){
  const slot = model.assignment.find(a=>a.game===game && a.half===half);
  if(!slot){
    return {ok:false, msg:'Fant ikke kamp/omgang.'};
  }
  const current = slot.keeper;
  const injured = injuredName?.trim() || current;

  slot.keeper = null;

  const usedThisGame = new Set(
    model.assignment.filter(a=>a.game===game && a.keeper).map(a=>a.keeper)
  );

  function consecBlocked(name, game){
    const prev = model.assignment.find(a=>a.game===game-1 && a.keeper===name);
    return !!prev;
  }

  let cands = model.keepers.filter(k=>!usedThisGame.has(k) && k!==injured && !consecBlocked(k, game));
  if(cands.length===0){
    cands = model.keepers.filter(k=>!usedThisGame.has(k) && k!==injured);
  }
  if(cands.length===0){
    cands = model.players.filter(p=>!usedThisGame.has(p) && p!==injured);
  }

  const counts = {}; model.players.forEach(p=> counts[p] = model.totals[p]||0);
  cands.sort((a,b)=> (counts[a]??0)-(counts[b]??0));

  const pick = cands[0] || '—';
  slot.keeper = pick;

  if(pick!=='—'){
    model.totals[pick] = (model.totals[pick]||0)+1;
    if(injured && injured!=='—' && current===injured){
      model.totals[injured] = Math.max(0,(model.totals[injured]||0)-1);
    }
    return {ok:true, msg:`Erstattet ${injured || 'nåværende'} med ${pick} i kamp ${game}, ${half}. omg.`};
  } else {
    return {ok:false, msg:`Fant ingen gyldig erstatter for kamp ${game}, ${half}. omg.`};
  }
}

// ---------- UI-handlers ----------
function generateB(){
  const input = parseInputs();
  if(input.players.length===0){
    showMessage('<div class="error">Legg inn minst én spiller.</div>');
    return;
  }
  if(input.keepers.length===0){
    showMessage('<div class="error">Ingen villige keepere blant spillerne.</div>');
    return;
  }
  const model = buildPlanB(input);
  window.__BMODEL__ = model;
  renderPlan(model);
}

function clearAll(){
  document.getElementById('players').value = '';
  document.getElementById('keeperWish').value = '';
  document.getElementById('games').value = 4;
  document.getElementById('minutes').value = 30;
  document.getElementById('avoidConsecutive').checked = true;
  document.getElementById('strictBalance').checked = true;
  document.getElementById('injGame').value = 1;
  document.getElementById('injHalf').value = "1";
  document.getElementById('injName').value = '';
  const out = document.getElementById('output');
  out.style.display = 'none';
  out.innerHTML = '';
  window.__BMODEL__ = null;
}

function doInjury(){
  const model = window.__BMODEL__;
  if(!model){
    showMessage('<div class="warning">Lag en plan først (trykk <strong>B – Lag plan</strong>).</div>');
    return;
  }
  const game = clamp(parseInt(document.getElementById('injGame').value||'1',10),1,model.games);
  const half = parseInt(document.getElementById('injHalf').value||'1',10);
  const name = document.getElementById('injName').value.trim();

  const res = repairInjury(model, game, half, name);
  const note = res.ok ? `<div class="small success">${res.msg}</div>` : `<div class="small warning">${res.msg}</div>`;
  renderPlan(model);
  const out = document.getElementById('output');
  out.innerHTML = note + out.innerHTML;
}

// Demo-data for rask start
(function seed(){
  const players = `Åshild
Lykke
Ida
Mille
Tara`;
  document.getElementById('players').value = players;
  document.getElementById('keeperWish').value = 'Åshild, Lykke, Ida';
})();

// Koble knapper
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnB').addEventListener('click', generateB);
  document.getElementById('btnClear').addEventListener('click', clearAll);
  document.getElementById('btnInjury').addEventListener('click', doInjury);
});
