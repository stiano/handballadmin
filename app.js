
(function(){
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const fmt = m => { const s=Math.round(m*60); const mm=Math.floor(s/60), ss=s%60; return `${mm}:${String(ss).padStart(2,'0')}`; };
  const LS_KEY = 'handball_pwa_state_v2';

  function addPlayerRow(name='', wantsGK=true){
    const wrap = document.createElement('div');
    wrap.className='player-row';
    wrap.innerHTML = `
      <input type="text" class="pname" placeholder="Navn" value="${name}"/>
      <select class="pgk">
        <option value="Ja" ${wantsGK? 'selected':''}>Vil stå keeper: Ja</option>
        <option value="Nei" ${!wantsGK? 'selected':''}>Vil stå keeper: Nei</option>
      </select>
      <button class="link remove">✖</button>
    `;
    wrap.querySelector('.remove').addEventListener('click', ()=> wrap.remove());
    $('#players').appendChild(wrap);
  }
  function ensurePlayersUI(){ if(!$('#players').children.length){ for(let i=0;i<5;i++) addPlayerRow(); } }

  function getInputs(){
    const matches = parseInt($('#matches').value,10);
    const duration = parseFloat($('#duration').value);
    const K = parseInt($('#keeperSwitches').value,10);
    const strategy = $('#strategy').value; // 'A' or 'B'
    const noConsec = $('#noConsecutiveGK').checked;
    const players = $$('.player-row').map(row=>({
      name: row.querySelector('.pname').value.trim(),
      wantsGK: row.querySelector('.pgk').value==='Ja'
    })).filter(p=>p.name);
    return {matches, duration, K, strategy, noConsec, players};
  }
  function setInputs(s){
    $('#matches').value = s.matches ?? 4;
    $('#duration').value = s.duration ?? 15;
    $('#keeperSwitches').value = s.K ?? 1;
    $('#strategy').value = s.strategy ?? 'B';
    $('#noConsecutiveGK').checked = !!(s.noConsec ?? true);
    $('#players').innerHTML='';
    (s.players||[]).forEach(p=> addPlayerRow(p.name, !!p.wantsGK));
  }
  function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(getInputs())); }
  function loadState(){ try{ const s=JSON.parse(localStorage.getItem(LS_KEY)||'{}'); if(s.players){ setInputs(s); } }catch(e){} }

  // Math helpers
  const gcd=(a,b)=> b? gcd(b,a%b):a;
  const lcm=(a,b)=> a*b / gcd(a,b);

  function chooseBlockCount(totalMin, N, K){
    const B=Math.max(0,N-4), seg=K+1;
    if(B===0) return seg;
    for(let M=seg; M<=20; M++) if(M%seg===0 && (M*B)%N===0) return M;
    let M = lcm(seg, Math.floor(N/gcd(N,B)) || seg); if(M<seg) M=seg; return Math.min(M,20);
  }
  const buildBlocks=(T,M)=> Array.from({length:M}, (_,i)=>[+(i*(T/M)).toFixed(6), +((i+1)*(T/M)).toFixed(6)]);

  // Keeper pairs per match, respecting noConsec for K=1
  function keeperPairs(matches, kc, noConsec, K){
    if(!kc.length) throw new Error('Minst én må være keeperkandidat.');
    const pairs=[]; const segs=K+1;
    if(K===1){
      for(let m=0;m<matches;m++){
        let chosen=null;
        for(let i=0;i<kc.length;i++) for(let j=i+1;j<kc.length;j++){
          const a=kc[i], b=kc[j]; const prev=pairs[pairs.length-1]||[];
          if(!(noConsec && (prev.includes(a)||prev.includes(b)))){ chosen=[a,b]; break; }
        }
        if(!chosen){ chosen=[kc[m%kc.length], kc[(m+1)%kc.length]]; }
        pairs.push(chosen);
      }
      return pairs;
    } else {
      for(let m=0;m<matches;m++){
        const prev=new Set(pairs.flat()); const arr=[];
        for(let s=0;s<segs;s++){
          let pick = kc.find(x=>!(noConsec && prev.has(x)) && !arr.includes(x)) || kc.find(x=>!arr.includes(x)) || kc[0];
          arr.push(pick);
        }
        pairs.push(arr);
      }
      return pairs;
    }
  }

  function planA(players, wantsGK, matches, T, K, noConsec){
    const N=players.length; if(N<4) throw new Error('Minst 4 spillere.');
    const M=chooseBlockCount(T,N,K), blocks=buildBlocks(T,M), segs=K+1, bps=Math.floor(M/segs);
    const keeperPerMatch=keeperPairs(matches, wantsGK, noConsec, K);
    const out=[], totals=Object.fromEntries(players.map(p=>[p,{play:0,gk:0}]));

    for(let m=0;m<matches;m++){
      const keepers = keeperPerMatch[m];
      const B=Math.max(0,N-4);
      const benchPlan=[];
      for(let s=0;s<segs;s++){
        const cap=bps*B; const cand=players.filter(p=>p!==keepers[s]);
        const base=Math.floor(cap/cand.length); let rem=cap-base*cand.length;
        const counts=Object.fromEntries(cand.map(p=>[p,base]));
        for(const p of cand){ if(rem<=0) break; counts[p]++; rem--; }
        const lst=[]; for(const p of cand){ for(let i=0;i<counts[p];i++) lst.push(p); }
        benchPlan.push(lst);
      }
      const micro=[];
      for(let i=0;i<M;i++){
        const seg=Math.min(segs-1, Math.floor(i/bps)); const k=keepers[seg];
        const [a,b]=blocks[i]; const cand=players.filter(p=>p!==k); let bench='—';
        if(cand.length>3){ const lst=benchPlan[seg]; bench = lst.length? lst.shift(): cand[cand.length-1]; }
        const field=cand.filter(p=>p!==bench).slice(0,3);
        micro.push({a,b,keeper:k,bench,field});
        const dur=b-a; totals[k].gk+=dur; totals[k].play+=dur; field.forEach(p=> totals[p].play+=dur);
      }
      const group = (M%10===0)? 2 : (M%6===0? M/6 : 2);
      const coach=[]; for(let i=0;i<M;i+=group){ const a=micro[i].a, b=micro[Math.min(i+group-1,M-1)].b; const ks=new Set(micro.slice(i,i+group).map(x=>x.keeper)); let kdisp=''; if(ks.size===1) kdisp=[...ks][0]; else kdisp=`${micro[i].keeper}→${micro[i+group-1].keeper}`; coach.push({a,b,keeper:kdisp,bench:micro[i].bench,field:micro[i].field}); }
      out.push({match:m+1, keepers, micro, coach});
    }
    return {out, totals};
  }

  function planB(players, wantsGK, matches, T, K, noConsec){
    const N=players.length; if(N<4) throw new Error('Minst 4 spillere.');
    const block=3, M=Math.floor(T/block); const blocks=Array.from({length:M},(_,i)=>[i*block,(i+1)*block]);
    const segs=K+1, segLen=T/segs; const keeperPerMatch=keeperPairs(matches, wantsGK, noConsec, K);
    const out=[], totals=Object.fromEntries(players.map(p=>[p,{play:0,gk:0}]));

    for(let m=0;m<matches;m++){
      const keepers=keeperPerMatch[m];
      const micro=[]; let rr=0; const startIdx=m%players.length; const B=Math.max(0,N-4);
      for(let i=0;i<M;i++){
        const [a,b]=blocks[i], mid=(a+b)/2; const seg=Math.min(segs-1, Math.floor(mid/segLen)); const k=keepers[seg];
        const cand=players.filter(p=>p!==k); let bench='—';
        if(B>0){ const rot=(rr+startIdx)%cand.length; const ordered=cand.slice(rot).concat(cand.slice(0,rot)); bench=ordered[0]; }
        const field=cand.filter(p=>p!==bench).slice(0,3); micro.push({a,b,keeper:k,bench,field});
        const dur=b-a; totals[k].gk+=dur; totals[k].play+=dur; field.forEach(p=> totals[p].play+=dur); rr++;
      }
      const coach=micro.map(x=>({a:x.a,b:x.b,keeper:x.keeper,bench:x.bench,field:x.field}));
      out.push({match:m+1, keepers, micro, coach});
    }
    return {out, totals};
  }

  function render(plan, T){
    $('#output').hidden=false;
    const rows = Object.entries(plan.totals).map(([p,v])=>`<tr><td>${p}</td><td>${v.play.toFixed(2)}</td><td>${v.gk.toFixed(2)}</td></tr>`).join('');
    $('#summary').innerHTML = `
      <h3>Oppsummering</h3>
      <table class="table"><thead><tr><th>Spiller</th><th>Totalt (min)</th><th>Totalt keeper (min)</th></tr></thead><tbody>${rows}</tbody></table>`;

    const parts=[];
    for(const m of plan.out){
      const klabel = Array.isArray(m.keepers)? m.keepers.join(' & ') : m.keepers;
      let html = `<h3>Kamp ${m.match} <span class="badge">Keepere: ${klabel}</span></h3>`;
      html += `<h4>Coach‑plan</h4>` + tableFrom(m.coach);
      if(m.micro.length !== m.coach.length){ html += `<details><summary>Vis Gull‑plan (mikro‑blokker)</summary>` + tableFrom(m.micro) + `</details>`; }
      parts.push(`<div class="card">${html}</div>`);
    }
    $('#schedules').innerHTML = parts.join('\n');

    function tableFrom(arr){
      const rows = arr.map(r=>`<tr><td>${fmt(r.a)}</td><td>${fmt(r.b)}</td><td>${r.keeper}</td><td>${r.field[0]||''}</td><td>${r.field[1]||''}</td><td>${r.field[2]||''}</td><td>${r.bench||'—'}</td></tr>`).join('');
      return `<table class="table"><thead><tr><th>Fra</th><th>Til</th><th>Keeper</th><th>U1</th><th>U2</th><th>U3</th><th>Benk</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
  }

  function exportJSON(state, plan){ const blob=new Blob([JSON.stringify({state, plan}, null, 2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='kampoppsett.json'; a.click(); URL.revokeObjectURL(url); }
  function exportCSV(plan){ let lines=['Kamp;Fra;Til;Keeper;U1;U2;U3;Benk']; for(const m of plan.out){ for(const r of m.coach){ lines.push([m.match, fmt(r.a), fmt(r.b), r.keeper, r.field[0]||'', r.field[1]||'', r.field[2]||'', r.bench||''].join(';')); } } const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='kampoppsett_coach.csv'; a.click(); URL.revokeObjectURL(url); }

  // Nødplan keeperskade
  function computeInjuryPlan(state, plan){
    const mIdx = Math.max(1, parseInt($('#injMatch').value,10)||1) - 1;
    const minute = parseFloat($('#injMinute').value||'0');
    const injured = ($('#injName').value||'').trim();
    if(!plan || !plan.out || !plan.out[mIdx]) return {html:'Generer et oppsett først.'};
    const match = plan.out[mIdx];
    const arr = match.micro && match.micro.length? match.micro : match.coach;
    const blk = arr.find(b => minute >= b.a && minute < b.b) || arr[arr.length-1];
    const currentKeeper = blk.keeper.includes('→') ? match.keepers[Math.min( Math.floor(minute / ( (plan.out[mIdx].micro?.slice(-1)[0].b || state.duration) / (state.K+1) )), (state.K))] : blk.keeper;

    if(injured && injured!==currentKeeper){
      // if user typed a different name, override
    }

    // Preferred replacement: the "other scheduled keeper" for this match
    let replacement = null;
    const others = Array.isArray(match.keepers)? match.keepers.filter(x=>x!==injured) : [];
    if(others.length){ replacement = others[0]; }

    // Else: pick from wantsGK with least keeper-min so far
    const wantsGK = state.players.filter(p=>p.wantsGK).map(p=>p.name);
    const totals = plan.totals || {};
    if(!replacement){
      const elig = wantsGK.filter(n=>n!==injured);
      if(elig.length){ replacement = elig.sort((a,b)=> (totals[a]?.gk||0) - (totals[b]?.gk||0))[0]; }
    }

    // Else: pick any non-injured player
    if(!replacement){
      const names = state.players.map(p=>p.name).filter(n=>n!==injured);
      replacement = names[0];
    }

    // Who should take the bench right now (simple suggestion): first field player in block
    const benchNow = (blk.field && blk.field.length)? blk.field[0] : (blk.bench && blk.bench!=='—'? blk.bench : '(valgfri)');

    const html = `
      <hr/>
      <h3>Nødplan for kamp ${mIdx+1}, tid ${fmt(minute)}</h3>
      <ol>
        <li><b>Nå:</b> Sett <b>${replacement}</b> i mål umiddelbart.</li>
        <li><b>Rotasjon nå:</b> La <b>${benchNow}</b> ta benken ut blokken for å frigjøre ${replacement} (juster rolig ved neste bytte).</li>
        <li><b>Etter kampen:</b> For rettferdighet – ikke sett <b>${replacement}</b> som keeper i neste kamp (om mulig), og unngå at skadet keeper står i neste kamp.</li>
      </ol>
      <p class="muted">Små avvik i spilletid er OK – balanse justeres i neste kamp.</p>
    `;
    return {html};
  }

  // Events
  $('#addPlayer').addEventListener('click', ()=> addPlayerRow());
  $('#resetExample').addEventListener('click', ()=>{
    setInputs({
      matches:4, duration:15, K:1, strategy:'B', noConsec:true,
      players:[
        {name:'Spiller 1', wantsGK:true},
        {name:'Spiller 2', wantsGK:true},
        {name:'Spiller 3', wantsGK:true},
        {name:'Spiller 4', wantsGK:true},
        {name:'Spiller 5', wantsGK:true}
      ]
    });
    saveState();
  });
  // ⚡ Hurtigknapp: Alternativ B for laget deres
  $('#quickB').addEventListener('click', ()=>{
    setInputs({
      matches:4, duration:15, K:1, strategy:'B', noConsec:true,
      players:[
        {name:'Åshild', wantsGK:true},
        {name:'Lykke', wantsGK:true},
        {name:'Ida', wantsGK:true},
        {name:'Mille', wantsGK:false},
        {name:'Tara', wantsGK:true}
      ]
    });
    saveState();
    $('#generate').click();
    // fyll inn nødplan-felt auto
    $('#injMatch').value = 1; $('#injMinute').value = 7.5; $('#injName').value = 'Åshild';
  });

  ['matches','duration','keeperSwitches','strategy','noConsecutiveGK'].forEach(id=> $('#'+id).addEventListener('change', saveState));
  document.addEventListener('input', e=>{ if(e.target.classList.contains('pname')||e.target.classList.contains('pgk')) saveState(); });

  $('#generate').addEventListener('click', ()=>{
    try{
      const s=getInputs(); saveState();
      const names=s.players.map(p=>p.name); const wants=s.players.filter(p=>p.wantsGK).map(p=>p.name);
      if(names.length<4) throw new Error('Du må ha minst 4 spillere.');
      if(!wants.length) throw new Error('Minst én må være markert som keeper.');
      const planner = s.strategy==='A'? planA : planB;
      const plan = planner(names, wants, s.matches, s.duration, s.K, s.noConsec);
      window.__lastPlan=plan; window.__lastState=s;
      render(plan, s.duration);
    }catch(err){ alert(err.message||String(err)); }
  });

  $('#exportJson').addEventListener('click', ()=>{ if(!window.__lastPlan) return alert('Generer et oppsett først.'); exportJSON(window.__lastState, window.__lastPlan); });
  $('#exportCsv').addEventListener('click', ()=>{ if(!window.__lastPlan) return alert('Generer et oppsett først.'); exportCSV(window.__lastPlan); });

  $('#injCompute').addEventListener('click', ()=>{
    if(!window.__lastPlan) return alert('Generer et oppsett først.');
    const res = computeInjuryPlan(window.__lastState, window.__lastPlan);
    $('#injuryOut').innerHTML = res.html || '';
  });

  $('#aboutLink').addEventListener('click', (e)=>{ e.preventDefault(); document.querySelector('#about').showModal(); });
  $('#closeAbout').addEventListener('click', ()=> document.querySelector('#about').close());

  // SW
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }

  ensurePlayersUI(); loadState();
})();
