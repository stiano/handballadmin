
/*
 * script.v2.js (patched)
 * 
 * Purpose: Robust helper + Alternativ B planner (3:00 bytter) with fixes for
 *          splitList regex error and unexpected-token issues.
 *
 * Key fixes:
 *  - Replaces invalid `split(/?/ )` with a robust splitter over commas, newlines,
 *    semicolons, pipes, slashes, tabs, and multiple spaces.
 *  - Strips zero-width/BOM/non-breaking spaces to prevent unexpected tokens.
 *  - Adds greedy keeper pairing for K=1 to ensure fair coverage (no player left with 0 keeper halves when possible),
 *    while honoring the "no consecutive matches as keeper" rule where feasible.
 *
 * Usage:
 *   // Pure functions
 *   const players = TeamPlannerB.splitList("Åshild, Lykke, Ida, Mille, Tara");
 *   const wants   = TeamPlannerB.splitList("Åshild, Lykke, Ida, Tara");
 *   const plan = TeamPlannerB.planB(players, wants, 4, 15, 1, true);
 *   // Optionally render into DOM if your page has #out, #summary, #schedules etc.:
 *   TeamPlannerB.render(plan);
 *
 * Optional UI auto-wire:
 *   If your HTML has inputs with ids: pNames, pGK, cnt, dur, K, noConsec and buttons run, csvBtn, quick,
 *   call: TeamPlannerB.attachUI();
 */
(function(global){
  'use strict';

  // ---------------- Text sanitation & list split ----------------
  function cleanText(txt){
    return (txt||'')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')   // zero-width + BOM
      .replace(/\u00A0/g, ' ')                   // NBSP -> space
      .normalize ? (txt||'').normalize('NFKC') : (txt||'');
  }
  function uniq(arr){
    var seen = Object.create(null), out = [], i, v;
    for(i=0;i<arr.length;i++){ v=arr[i]; if(!seen[v]){ seen[v]=1; out.push(v);} }
    return out;
  }
  function splitList(txt){
    var src = cleanText(txt);
    // Split on: commas, semicolons, pipes, slashes, tabs, newlines OR sequences of 2+ spaces
    var raw = src.split(/[\,\n\r\t;\|\/]+|\s{2,}/);
    var out = [];
    for (var i=0;i<raw.length;i++){
      var s = (raw[i]||'').trim();
      if(s && out.indexOf(s)===-1) out.push(s);
    }
    return out;
  }

  // ---------------- Helpers ----------------
  function fmt(min){
    var s = Math.round(min*60);
    var m = Math.floor(s/60), sec = s%60;
    return m+":"+(''+sec).padStart(2,'0');
  }
  function el(tag, attrs){
    var e = document.createElement(tag);
    if(attrs){ for(var k in attrs){ try{ e[k]=attrs[k]; }catch(_){ /* noop */ } } }
    return e;
  }

  // ---------------- Blocks (B: 3:00) ----------------
  function buildBlocksB(T){
    var blocks=[], t=0;
    while (t + 3 <= T + 1e-9){ blocks.push([t, t+3]); t += 3; }
    if (t < T - 1e-9) blocks.push([t, T]); // tail block if not divisible by 3
    return blocks;
  }

  // ---------------- Keeper pairing ----------------
  // Greedy for K=1 (two keepers per match): ensure coverage-first while trying to honor no-consecutive rule.
  function keeperPairsGreedy(matches, kc, noConsec, K){
    var segs = K+1;
    if (segs !== 2){
      // Fallback simple rotation for K!=1
      var out=[], prev=[];
      for (var m=0;m<matches;m++){
        var pair=null, i,j;
        outer: for(i=0;i<kc.length;i++){
          for(j=i+1;j<kc.length;j++){
            var a=kc[i], b=kc[j];
            if (noConsec && (prev.indexOf(a)>=0 || prev.indexOf(b)>=0)) continue;
            pair=[a,b]; break outer;
          }
        }
        if(!pair) pair=[kc[m%kc.length], kc[(m+1)%kc.length]];
        out.push(pair); prev=pair.slice();
      }
      return out;
    }
    // K=1: coverage-first
    var counts = {}, i; for(i=0;i<kc.length;i++) counts[kc[i]] = 0;
    var prevSet = new Set();
    var res=[];
    for (var m=0;m<matches;m++){
      // sort by (count, name) for stability
      var cand = kc.slice().sort(function(a,b){
        if (counts[a]!==counts[b]) return counts[a]-counts[b];
        return a<b?-1:a>b?1:0;
      });
      var first=null, second=null;
      // pick first not in prev if possible
      for(i=0;i<cand.length;i++){ if(!(noConsec && prevSet.has(cand[i]))){ first=cand[i]; break; } }
      if(!first) first = cand[0];
      // pick second different from first and not in prev if possible
      for(i=0;i<cand.length;i++){
        var c=cand[i]; if(c===first) continue; if(noConsec && prevSet.has(c)) continue; second=c; break;
      }
      if(!second){ for(i=0;i<cand.length;i++){ if(cand[i]!==first){ second=cand[i]; break; } } }
      counts[first]  += 1;
      counts[second] += 1;
      res.push([first, second]);
      prevSet = new Set([first, second]);
    }
    return res;
  }

  // ---------------- Core planner (B) ----------------
  function planB(players, wants, matches, T, K, noConsec){
    if (!players || players.length<4) throw new Error('Minst 4 spillere.');
    wants = wants && wants.length ? wants.slice() : [];
    var blocks = buildBlocksB(T);
    var segs = K+1; var segLen = T/segs;
    var kp = keeperPairsGreedy(matches, wants, noConsec, K);

    var out=[], totals={}, i; for(i=0;i<players.length;i++){ totals[players[i]]={play:0,gk:0}; }

    for (var m=0;m<matches;m++){
      var keepers = kp[m];
      var rows=[]; var startIdx = m % players.length; var rr=0;
      for (var b=0;b<blocks.length;b++){
        var a=blocks[b][0], bb=blocks[b][1];
        var mid=(a+bb)/2; var seg=Math.min(segs-1, Math.floor(mid/segLen));
        var k=keepers[seg];
        var cand = players.filter(function(p){ return p!==k; });
        var bench='—';
        if (players.length>4){
          var rot=(rr+startIdx)%cand.length;
          var ordered=cand.slice(rot).concat(cand.slice(0,rot));
          bench=ordered[0];
        }
        var field=[]; for(i=0;i<cand.length;i++){ if(cand[i]!==bench){ field.push(cand[i]); if(field.length===3) break; } }
        rows.push({a:a,b:bb,keeper:k,field:field,bench:bench});
        var dur=bb-a; totals[k].gk+=dur; totals[k].play+=dur; for(i=0;i<field.length;i++){ totals[field[i]].play+=dur; }
        rr++;
      }
      out.push({match:m+1, keepers:keepers.slice(), rows:rows});
    }
    return {out:out, totals:totals};
  }

  // ---------------- Rendering & CSV ----------------
  function render(plan){
    var outCard = document.getElementById('outCard'); if(outCard) outCard.hidden=false;
    var summary = document.getElementById('summary'); var schedules = document.getElementById('schedules');
    if (!summary || !schedules) return plan; // nothing to render

    // summary
    var rows='';
    for (var p in plan.totals){ if(!plan.totals.hasOwnProperty(p)) continue; var v=plan.totals[p];
      rows += '<tr><td>'+p+'</td><td>'+v.play.toFixed(2)+'</td><td>'+v.gk.toFixed(2)+'</td></tr>';
    }
    summary.innerHTML = '<h3>Oppsummering</h3>'+
      '<table class="table"><thead><tr><th>Spiller</th><th>Totalt (min)</th><th>Keeper (min)</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>';

    // per match
    var parts=[];
    for (var mi=0; mi<plan.out.length; mi++){
      var mm=plan.out[mi];
      var klabel = mm.keepers.join(' & ');
      var html = '<h3>Kamp '+mm.match+' <span class="badge">Keepere: '+klabel+'</span></h3>';
      html += tableOf(mm.rows);
      parts.push('<div class="card">'+html+'</div>');
    }
    schedules.innerHTML = parts.join('');
    return plan;

    function tableOf(arr){
      var rs='';
      for (var i=0;i<arr.length;i++){
        var r=arr[i];
        rs += '<tr>'+
          '<td>'+fmt(r.a)+'</td><td>'+fmt(r.b)+'</td><td>'+r.keeper+'</td>'+
          '<td>'+(r.field[0]||'')+'</td><td>'+(r.field[1]||'')+'</td><td>'+(r.field[2]||'')+'</td>'+
          '<td>'+(r.bench||'—')+'</td>'+
        '</tr>';
      }
      return '<table class="table"><thead><tr><th>Fra</th><th>Til</th><th>Keeper</th><th>U1</th><th>U2</th><th>U3</th><th>Benk</th></tr></thead><tbody>'+rs+'</tbody></table>';
    }
  }

  function toCSV(plan){
    var lines=['Kamp;Fra;Til;Keeper;U1;U2;U3;Benk'];
    for (var i=0;i<plan.out.length;i++){
      var mm=plan.out[i];
      for (var j=0;j<mm.rows.length;j++){
        var r=mm.rows[j];
        lines.push([mm.match, fmt(r.a), fmt(r.b), r.keeper, r.field[0]||'', r.field[1]||'', r.field[2]||'', r.bench||''].join(';'));
      }
    }
    var blob = new Blob([lines.join('\n')], {type:'text/csv'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download='kampoppsett_B.csv'; a.click(); URL.revokeObjectURL(url);
  }

  // ---------------- Optional UI wire (if elements exist) ----------------
  function attachUI(){
    var pNames = document.getElementById('pNames');
    var pGK    = document.getElementById('pGK');
    var cnt    = document.getElementById('cnt');
    var dur    = document.getElementById('dur');
    var K      = document.getElementById('K');
    var noConsec = document.getElementById('noConsec');
    var runBtn = document.getElementById('run');
    var csvBtn = document.getElementById('csvBtn');
    var quick  = document.getElementById('quick');

    if (quick) quick.onclick = function(){
      if(pNames) pNames.value = 'Åshild, Lykke, Ida, Mille, Tara';
      if(pGK)    pGK.value    = 'Åshild, Lykke, Ida, Tara';
      if(cnt)    cnt.value    = 4;
      if(dur)    dur.value    = 15;
      if(K)      K.value      = 1;
      if(noConsec) noConsec.checked = true;
    };

    if (runBtn) runBtn.onclick = function(){
      try{
        var names = splitList(pNames ? pNames.value : '');
        var wants = splitList(pGK ? pGK.value : '');
        var matches = cnt ? (+cnt.value||4) : 4;
        var T       = dur ? (+dur.value||15) : 15;
        var kseg    = K ? (+K.value||1) : 1;
        var noc     = noConsec ? !!noConsec.checked : true;
        if (names.length<4) return alert('Minst 4 spillere.');
        if (!wants.length)   return alert('Minst én vil stå keeper.');
        var plan = planB(names, wants, matches, T, kseg, noc);
        global.__lastPlanB = plan; render(plan);
      }catch(err){ alert(err.message||String(err)); }
    };

    if (csvBtn) csvBtn.onclick = function(){
      if (!global.__lastPlanB){
        // try to compute from inputs if possible
        if (pNames && pGK){
          var names = splitList(pNames.value), wants=splitList(pGK.value);
          var matches = cnt ? (+cnt.value||4) : 4;
          var T       = dur ? (+dur.value||15) : 15;
          var kseg    = K ? (+K.value||1) : 1;
          var noc     = noConsec ? !!noConsec.checked : true;
          if (names.length>=4 && wants.length){ global.__lastPlanB = planB(names,wants,matches,T,kseg,noc); }
        }
      }
      if (!global.__lastPlanB) return alert('Generer først.');
      toCSV(global.__lastPlanB);
    };
  }

  // ---------------- Export ----------------
  var api = {
    // helpers
    cleanText: cleanText,
    uniq: uniq,
    splitList: splitList,
    fmt: fmt,
    // core
    buildBlocksB: buildBlocksB,
    keeperPairsGreedy: keeperPairsGreedy,
    planB: planB,
    render: render,
    toCSV: toCSV,
    attachUI: attachUI
  };

  global.TeamPlannerB = api;
})(typeof window!=='undefined'? window : this);
