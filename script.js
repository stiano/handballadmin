
// ---------- Hjelpefunksjoner (kompatible) ----------
function uniq(arr) {
  var seen = Object.create(null);
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var v = (arr[i] || "").trim();
    if (v && !seen[v]) { seen[v] = true; out.push(v); }
  }
  return out;
}

// Erstatter alle komma med linjeskift og splitter på CRLF/LF
function splitList(txt) {
  var normalized = (txt || "").replace(/,/g, "
");
  return uniq(normalized.split(/?
/));
}

function clamp(n, min, max) {
  n = Number(n);
  if (isNaN(n)) n = min;
  if (n < min) n = min;
  if (n > max) n = max;
  return n;
}

function parseInputs(){
  var players = splitList(document.getElementById('players').value);
  var keepers = splitList(document.getElementById('keeperWish').value);
  if(keepers.length===0) keepers = players.slice();

  // Filtrer keepere som faktisk er i spillerlista
  keepers = keepers.filter(function(k){ return players.indexOf(k) !== -1; });

  var games = clamp(parseInt(document.getElementById('games').value||'0',10),1,999);
  var minutes = clamp(parseInt(document.getElementById('minutes').value||'0',10),1,999);
  var avoidConsecutive = document.getElementById('avoidConsecutive').checked;
  var strictBalance = document.getElementById('strictBalance').checked;

  return {players:players, keepers:keepers, games:games, minutes:minutes, avoidConsecutive:avoidConsecutive, strictBalance:strictBalance};
}

function showMessage(html){
  var out = document.getElementById('output');
  out.style.display = 'block';
  out.innerHTML = html;
}

function renderPlan(model){
  var players = model.players;
  var keepers = model.keepers;
  var games = model.games;
  var minutes = model.minutes;
  var assignment = model.assignment;
  var totals = model.totals;

  var halfMin = Math.floor(minutes/2);
  var html = '';

  html += '<div class="flex">' +
    '<span class="tag">Spillere: <strong>' + players.length + '</strong></span>' +
    '<span class="tag">Villige keepere: <strong>' + keepers.length + '</strong></span>' +
    '<span class="tag">Kamper: <strong>' + games + '</strong></span>' +
    '<span class="tag">Min/kamp: <strong>' + minutes + '</strong> (≈ ' + halfMin + ' pr. omgang)</span>' +
    '<span class="right small hint">Alternativ B: To omganger pr. kamp, én keeperbytte.</span>' +
  '</div>' +
  '<div class="sep"></div>';

  // Per kamp
  html += '<div class="grid">';
  for(var g=1; g<=games; g++){
    var a1 = null, a2 = null;
    for (var i=0;i<assignment.length;i++){
      var a = assignment[i];
      if (a.game===g && a.half===1) a1 = a;
      if (a.game===g && a.half===2) a2 = a;
    }
    var k1 = (a1 && a1.keeper) ? a1.keeper : '—';
    var k2 = (a2 && a2.keeper) ? a2.keeper : '—';
    var warn = (k1==='—' || k2==='—') ? 'warning' : '';

    html += '<div class="game">' +
      '<h4>Kamp ' + g + '</h4>' +
      '<div class="flex">' +
        '<span class="pill">1. omg: <strong>' + k1 + '</strong></span>' +
        '<span class="pill">2. omg: <strong>' + k2 + '</strong></span>' +
      '</div>' +
      (warn?'<div class="small ' + warn + '" style="margin-top:8px;">Kunne ikke fullføre begge omgangene uten å bryte reglene.</div>':'') +
    '</div>';
  }
  html += '</div>';

  // Totaltid for keeper
  html += '<div class="sep"></div>' +
    '<h3 style="margin:0 0 8px 0;">Keeperminutter pr. spiller</h3>' +
    '<table><thead>' +
      '<tr><th>Spiller</th><th>Keeper‑omganger</th><th>Keeper‑minutter</th></tr>' +
    '</thead><tbody>';
  players.forEach(function(p){
    var halfs = totals[p]||0;
    html += '<tr><td>' + p + '</td><td>' + halfs + '</td><td>' + (halfs*halfMin) + '</td></tr>';
  });
  html += '</tbody></table>';

  // Fordelingsindikator
  var vals = players.map(function(p){ return totals[p]||0; });
  var max = Math.max.apply(null, vals);
  var min = Math.min.apply(null, vals);
  var ok = max - min <= 1;
  html += '<div class="small ' + (ok?'success':'warning') + '" style="margin-top:8px;">' +
    'Fordeling av keeper‑omganger: min=' + min + ', max=' + max + ' ' + (ok?'(±1 OK)':'(krever lemping pga. regler / få keepere)') +
  '</div>';

  showMessage(html);
}

// ---------- Keeperplan-algoritme (Alternativ B) ----------
function buildPlanB(opts){
  var players = opts.players;
  var keepers = opts.keepers;
  var games = opts.games;
  var minutes = opts.minutes; // ikke brukt i algoritmen, men del av modellen
  var avoidConsecutive = opts.avoidConsecutive;
  var strictBalance = opts.strictBalance;

  var slots = [];
  for(var g=1; g<=games; g++){
    slots.push({game:g, half:1});
    slots.push({game:g, half:2});
  }

  // Målfordeling kun over villige keepere
  var totalSlots = slots.length;
  var K = Math.max(keepers.length, 1);
  var base = Math.floor(totalSlots / K);
  var remainder = totalSlots % K;
  var target = {};
  for (var i=0; i<keepers.length; i++){
    var k = keepers[i];
    target[k] = base + (i < remainder ? 1 : 0);
  }

  var assign = [];
  var usedInGame = {}; // game -> Set-like object
  var assignedCount = {};
  players.forEach(function(p){ assignedCount[p]=0; });

  function consecBlocked(name, game){
    if(!avoidConsecutive) return false;
    for (var i=0;i<assign.length;i++){
      var a = assign[i];
      if (a.game===game-1 && a.keeper===name) return true;
    }
    return false;
  }

  function candidateList(game){
    var used = usedInGame[game] || {};
    var cands = keepers.filter(function(k){ return !used[k]; });
    if(avoidConsecutive){
      cands = cands.filter(function(k){ return !consecBlocked(k, game); });
    }
    return cands;
  }

  function pickCandidate(cands){
    if(!cands || cands.length===0) return null;
    // Score: (underTarget først), deretter færrest tildelte
    cands.sort(function(a,b){
      var aUnder = (typeof target[a]==='number' && assignedCount[a] < target[a]) ? 0 : 1;
      var bUnder = (typeof target[b]==='number' && assignedCount[b] < target[b]) ? 0 : 1;
      if (aUnder !== bUnder) return aUnder - bUnder;
      var ad = assignedCount[a]||0, bd = assignedCount[b]||0;
      if (ad !== bd) return ad - bd;
      return 0;
    });
    return cands[0];
  }

  for(var sIdx=0; sIdx<slots.length; sIdx++){
    var s = slots[sIdx];
    var used = usedInGame[s.game] || {};
    var cands = candidateList(s.game);

    if(strictBalance){
      var under = cands.filter(function(k){
        return (typeof target[k]==='number') ? (assignedCount[k] < target[k]) : true;
      });
      if(under.length>0) cands = under;
    }

    var pick = pickCandidate(cands);

    if(!pick){
      // Lemping 1: Ignorer consecutive-regelen
      var relaxed = keepers.filter(function(k){ return !used[k]; });
      if(strictBalance){
        var under2 = relaxed.filter(function(k){
          return (typeof target[k]==='number') ? (assignedCount[k] < target[k]) : true;
        });
        if(under2.length>0) relaxed = under2;
      }
      pick = pickCandidate(relaxed);
    }

    if(!pick){
      // Lemping 2: Ta fra spillere (som ikke nødvendigvis er villige) for å få plan
      var any = players.filter(function(p){ return !used[p]; });
      any.sort(function(a,b){
        var ad = assignedCount[a]||0, bd = assignedCount[b]||0;
        return ad - bd;
      });
      pick = any[0] || null;
    }

    assign.push({game:s.game, half:s.half, keeper: pick || '—'});
    if(pick){
      used[pick] = true;
      usedInGame[s.game] = used;
      assignedCount[pick] = (assignedCount[pick]||0)+1;
    }
  }

  var totals = {};
  players.forEach(function(p){ totals[p]=assignedCount[p]||0; });

  return {players:players, keepers:keepers, games:games, minutes:minutes, slots:slots, assignment: assign, totals:totals};
}

// ---------- Keeper-skade / hurtigreparasjon ----------
function repairInjury(model, game, half, injuredName){
  // Finn slot
  var slot = null;
  for (var i=0;i<model.assignment.length;i++){
    var a = model.assignment[i];
    if (a.game===game && a.half===half) { slot = a; break; }
  }
  if(!slot){
    return {ok:false, msg:'Fant ikke kamp/omgang.'};
  }

  var current = slot.keeper;
  var injured = (injuredName && injuredName.trim()) ? injuredName.trim() : current;

  // Fjern tildeling i slot
  slot.keeper = null;

  // Hvem er allerede brukt i denne kampen?
  var usedThisGame = {};
  for (var j=0;j<model.assignment.length;j++){
    var a2 = model.assignment[j];
    if (a2.game===game && a2.keeper) usedThisGame[a2.keeper] = true;
  }

  function consecBlocked(name, gameNum){
    for (var k=0;k<model.assignment.length;k++){
      var x = model.assignment[k];
      if (x.game===gameNum-1 && x.keeper===name) return true;
    }
    return false;
  }

  // Kandidater: villige, ikke brukt i kampen, ikke skadet, og ikke i forrige kamp
  var cands = model.keepers.filter(function(k){
    return !usedThisGame[k] && k!==injured && !consecBlocked(k, game);
  });

  if(cands.length===0){
    // Slipp consec-regelen
    cands = model.keepers.filter(function(k){
      return !usedThisGame[k] && k!==injured;
    });
  }
  if(cands.length===0){
    // Fallback: hvem som helst av spillerne
    cands = model.players.filter(function(p){
      return !usedThisGame[p] && p!==injured;
    });
  }

  // Prioriter færrest tildelte
  var counts = {};
  model.players.forEach(function(p){ counts[p] = model.totals[p]||0; });
  cands.sort(function(a,b){
    var ad = counts[a]||0, bd = counts[b]||0;
    return ad - bd;
  });

  var pick = cands[0] || '—';
  slot.keeper = pick;

  if(pick !== '—'){
    model.totals[pick] = (model.totals[pick]||0)+1;
    if(injured && injured!=='—' && current===injured){
      model.totals[injured] = Math.max(0,(model.totals[injured]||0)-1);
    }
    return {ok:true, msg:'Erstattet ' + (injured || 'nåværende') + ' med ' + pick + ' i kamp ' + game + ', ' + half + '. omg.'};
  } else {
    return {ok:false, msg:'Fant ingen gyldig erstatter for kamp ' + game + ', ' + half + '. omg.'};
  }
}

// ---------- UI-handlers ----------
function generateB(){
  var input = parseInputs();
  if(input.players.length===0){
    showMessage('<div class="error">Legg inn minst én spiller.</div>');
    return;
  }
  if(input.keepers.length===0){
    showMessage('<div class="error">Ingen villige keepere blant spillerne.</div>');
    return;
  }
  var model = buildPlanB(input);
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
  var out = document.getElementById('output');
  out.style.display = 'none';
  out.innerHTML = '';
  window.__BMODEL__ = null;
}

function doInjury(){
  var model = window.__BMODEL__;
  if(!model){
    showMessage('<div class="warning">Lag en plan først (trykk <strong>B – Lag plan</strong>).</div>');
    return;
  }
  var game = clamp(parseInt(document.getElementById('injGame').value||'1',10),1,model.games);
  var half = parseInt(document.getElementById('injHalf').value||'1',10);
  var name = document.getElementById('injName').value.trim();

  var res = repairInjury(model, game, half, name);
  var note = res.ok ? '<div class="small success">' + res.msg + '</div>' : '<div class="small warning">' + res.msg + '</div>';
  renderPlan(model);
  var out = document.getElementById('output');
  out.innerHTML = note + out.innerHTML;
}

// Demo-data for rask start
(function seed(){
  var players = 'Åshild
Lykke
Ida
Mille
Tara';
  document.getElementById('players').value = players;
  document.getElementById('keeperWish').value = 'Åshild, Lykke, Ida';
})();

// Koble knapper når DOM er klar
window.addEventListener('DOMContentLoaded', function () {
  document.getElementById('btnB').addEventListener('click', generateB);
  document.getElementById('btnClear').addEventListener('click', clearAll);
  document.getElementById('btnInjury').addEventListener('click', doInjury);
});
