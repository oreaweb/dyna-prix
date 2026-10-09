(()=>{"use strict";
  const URL="https://npgxpdcedhmouhduphte.supabase.co";
  const KEY="sb_publishable_F03AVvc9_J9CiMDzrPKDzQ_wczs5Zfp";
  const VERSION="0.5.0";
  let token="";
  let refreshToken="";
  const STORE="dyna_stats_google_session";
  const ALLOWED="aurelien.marcon@gmail.com";
  const redirect=location.origin+location.pathname;
  const authStyle="font-family:Arial,sans-serif;max-width:440px;margin:12vh auto;padding:30px;border-radius:16px;background:white;box-shadow:0 8px 35px #0002;text-align:center";
  function loginScreen(message=""){document.body.innerHTML=`<main style="${authStyle}"><h1>📊 Dyna Stats</h1><p style="color:#687386;font-size:13px">Version ${VERSION}</p><p>Connecte-toi avec ton compte Google autorisé pour consulter les statistiques.</p>${message?`<p style="color:#b00020">${esc(message)}</p>`:""}<button id="google-login" style="padding:13px 22px;background:#26364f;color:white;border:0;border-radius:9px;cursor:pointer;font-weight:bold">Se connecter avec Google</button></main>`; $("google-login").onclick=()=>{location.href=URL+"/auth/v1/authorize?provider=google&redirect_to="+encodeURIComponent(redirect)};}
  async function verifySession(){const u=await request("/auth/v1/user");if(u.email?.toLowerCase()!==ALLOWED || u.id!=="7e7f6c20-f84f-40d0-8f44-e196729f8831")throw Error("Compte connecté : "+(u.email||"adresse absente")+" ; identifiant : "+(u.id||"absent")+" ; version "+VERSION+". Ce compte ne correspond pas au compte autorisé.");return u;}
  async function restoreSession(){const hash=new URLSearchParams(location.hash.slice(1));if(hash.has("error")){history.replaceState(null,"",redirect);throw Error(hash.get("error_description")||"Connexion refusée.");}if(hash.has("access_token")){token=hash.get("access_token");refreshToken=hash.get("refresh_token")||"";history.replaceState(null,"",redirect);}else{const saved=JSON.parse(localStorage.getItem(STORE)||"null");token=saved?.access_token||"";refreshToken=saved?.refresh_token||"";}if(!token)throw Error("");try{await verifySession();}catch(e){if(!refreshToken)throw e;const r=await fetch(URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"apikey":KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshToken})});if(!r.ok)throw e;const j=await r.json();token=j.access_token;refreshToken=j.refresh_token;await verifySession();}const claims=JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));if(claims.role!=="authenticated")throw Error("Session sans rôle authenticated ("+esc(claims.role)+"). Reconnecte-toi.");localStorage.setItem(STORE,JSON.stringify({access_token:token,refresh_token:refreshToken}));}
  function logout(){if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;localStorage.removeItem(STORE);token="";refreshToken="";panel=null;loginScreen();}

  let panel=null,refreshTimer=null,loading=false;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const label={open:"Ouvertures",search_ean:"Recherches EAN",search_label:"Recherches libellé",search_empty:"Sans résultat",search_error:"Erreurs recherche",scan:"Scans",price_calculated:"Calculs de prix",reception_loaded:"Réceptions chargées",reception_item:"Articles contrôlés",reception_unexpected:"Produits non prévus",reception_report:"Bilans consultés",reception_sync_error:"Erreurs de synchronisation"};
  async function request(path,opt={}) {
    const r=await fetch(URL+path,{...opt,headers:{"apikey":KEY,"Content-Type":"application/json",...(token?{"Authorization":"Bearer "+token}:{}),...(opt.headers||{})}});
    const body=await r.json().catch(()=>null);
    if(!r.ok)throw Error(body?.msg||body?.message||body?.error_description||"HTTP "+r.status);
    return body;
  }
  const number=n=>Number(n||0).toLocaleString("fr-FR");
  const fmtDate=d=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
  const shiftDate=(d,n)=>{const x=new Date(d+"T12:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
  const C={prix:"#2478df",reception:"#18a68d"};
  const kpi=(name,value,detail,delta)=>'<div class="ds-kpi"><small>'+name+'</small><strong>'+number(value)+'</strong><em>'+detail+'</em>'+(delta===null?'':'<div class="ds-muted '+(delta>=0?'ds-up':'ds-down')+'">'+(delta>0?'+':'')+delta+' % vs période précédente</div>')+'</div>';
  const delta=(now,before)=>before===0?null:Math.round((now-before)/before*100);
  const sum=(rows,events,tool)=>rows.reduce((n,r)=>n+(events.includes(r.event)&&(!tool||r.tool===tool)?Number(r.total)||0:0),0);
  async function load(){
    if(!panel||loading)return;
    loading=true;
    $("ds-content").innerHTML='<p class="ds-muted">Chargement des statistiques…</p>';
    try{
      const period=$("ds-period").value,tool=$("ds-tool").value;
      const today=fmtDate(new Date());
      const custom=period==="custom";
      const start=custom?$("ds-from").value:shiftDate(today,1-Number(period));
      const end=custom?$("ds-to").value:today;
      if(!start||!end)throw Error("Choisis les deux dates.");
      if(start>end)throw Error("La date de début doit précéder la date de fin.");
      if(end>today)throw Error("La date de fin ne peut pas être dans le futur.");
      const days=Math.round((Date.parse(end+"T12:00:00Z")-Date.parse(start+"T12:00:00Z"))/86400000)+1;
      if(days>365)throw Error("Sélectionne une période de 365 jours maximum.");
      const previousStart=shiftDate(start,-days);
      const rows=await request("/rest/v1/rpc/dyna_stats_summary_range",{method:"POST",body:JSON.stringify({date_from:previousStart,date_to:end})});
      if(!Array.isArray(rows))throw Error("Réponse inattendue");
      const activity=await request("/rest/v1/rpc/dyna_stats_activity_range",{method:"POST",body:JSON.stringify({date_from:start,date_to:end})});
      if(!Array.isArray(activity))throw Error("Réponse horaire inattendue");
      const filtered=rows.filter(r=>tool==="all"||r.tool===tool);
      const current=filtered.filter(r=>r.day>=start&&r.day<=end);
      const previous=filtered.filter(r=>r.day>=previousStart&&r.day<start);
      const count=(e,t)=>sum(current,e,t),before=(e,t)=>sum(previous,e,t);
      const searches=["search_ean","search_label"],errors=["search_error","reception_sync_error"],actions=["search_ean","search_label","scan","price_calculated","reception_loaded","reception_item","reception_unexpected","reception_report"];
      const focus=tool==="reception"?[["Réceptions chargées",["reception_loaded"],"reception"],["Articles contrôlés",["reception_item"],"reception"],["Produits non prévus",["reception_unexpected"],"reception"],["Erreurs de synchronisation",["reception_sync_error"],"reception"]]:tool==="prix"?[["Recherches effectuées",searches,"prix"],["Scans",["scan"],"prix"],["Erreurs de recherche",["search_error"],"prix"],["Recherches sans résultat",["search_empty"],"prix"]]:[["Recherches de prix",searches,"prix"],["Articles contrôlés",["reception_item"],"reception"],["Réceptions chargées",["reception_loaded"],"reception"],["Calculs de prix",["price_calculated"],"prix"]];
      const cards=focus.map(([name,events,t])=>kpi(name,count(events,t),"Sur la période",delta(count(events,t),before(events,t)))).join("");
      const daysList=Array.from({length:days},(_,i)=>shiftDate(start,i));
      const perDay=daysList.map(day=>({day,prix:sum(current.filter(r=>r.day===day),actions,"prix"),reception:sum(current.filter(r=>r.day===day),actions,"reception")}));
      const max=Math.max(1,...perDay.map(r=>Math.max(r.prix,r.reception)));
      const stride=days<=7?1:days<=30?5:15;
      const graph=perDay.map((r,i)=>{
        const bar=(value,color)=>'<div style="flex:1;max-width:17px;height:'+Math.max(value?2:0,Math.round(value/max*130))+'px;background:'+color+';border-radius:4px 4px 0 0"></div>';
        const bars=(tool!=="reception"?bar(r.prix,C.prix):"")+(tool!=="prix"?bar(r.reception,C.reception):"");
        const tip=r.day+": "+(tool!=="reception"?number(r.prix)+" Dyna Prix":"")+(tool==="all"?", ":"")+(tool!=="prix"?number(r.reception)+" Dyna Réception":"");
        return '<div class="ds-day" title="'+esc(tip)+'"><div style="height:130px;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:3px">'+bars+'</div><span class="ds-day-label">'+(i%stride===0?r.day.slice(8,10)+"/"+r.day.slice(5,7):"")+'</span></div>';
      }).join("");
      const prixCount=sum(current,actions,"prix"),receptionCount=sum(current,actions,"reception"),total=prixCount+receptionCount;
      const split='<div class="ds-meter">'+(prixCount?'<span style="width:'+(prixCount/total*100)+'%;background:'+C.prix+'"></span>':'')+(receptionCount?'<span style="width:'+(receptionCount/total*100)+'%;background:'+C.reception+'"></span>':'')+'</div><div class="ds-line"><span><i class="ds-pill" style="background:'+C.prix+'"></i>Dyna Prix</span><b>'+number(prixCount)+' ('+(total?Math.round(prixCount/total*100):0)+' %)</b></div><div class="ds-line"><span><i class="ds-pill" style="background:'+C.reception+'"></i>Dyna Réception</span><b>'+number(receptionCount)+' ('+(total?Math.round(receptionCount/total*100):0)+' %)</b></div>';
      const details=[["Recherches EAN",["search_ean"],"prix"],["Recherches par libellé",["search_label"],"prix"],["Recherches sans résultat",["search_empty"],"prix"],["Erreurs de recherche",["search_error"],"prix"],["Scans",["scan"],"prix"],["Réceptions chargées",["reception_loaded"],"reception"],["Articles contrôlés",["reception_item"],"reception"],["Produits non prévus",["reception_unexpected"],"reception"],["Bilans consultés",["reception_report"],"reception"],["Erreurs de synchronisation",["reception_sync_error"],"reception"]].filter(x=>tool==="all"||x[2]===tool);
      const detailHtml=details.map(([name,events,t])=>'<div class="ds-line"><span>'+name+'</span><b>'+number(count(events,t))+'</b></div>').join("");
      const versions=new Map();
      current.forEach(r=>{if(r.event!=="open")return;const key=(r.tool==="prix"?"Dyna Prix ":"Dyna Réception ")+(r.version||"inconnue");versions.set(key,(versions.get(key)||0)+Number(r.total||0))});
      const versionsHtml=[...versions].sort((a,b)=>b[1]-a[1]).map(([v,n])=>'<div class="ds-line"><span>'+esc(v)+'</span><b>'+number(n)+' ouverture(s)</b></div>').join("")||'<p class="ds-muted">Aucune ouverture enregistrée.</p>';
      const active=activity.filter(r=>tool==="all"||r.tool===tool);
      const hours=Array.from({length:24},(_,h)=>active.filter(r=>Number(r.hour)===h).reduce((n,r)=>n+Number(r.total||0),0));
      const weekdays=Array.from({length:7},(_,d)=>active.filter(r=>Number(r.weekday)===d+1).reduce((n,r)=>n+Number(r.total||0),0));
      const peak=Math.max(1,...hours),dayPeak=Math.max(1,...weekdays);
      const hoursHtml='<div style="display:flex;align-items:end;gap:3px;height:110px;border-bottom:1px solid #d7e0ec">'+hours.map((n,h)=>'<div title="'+h+' h : '+number(n)+' actions" style="flex:1;height:'+Math.max(n?2:0,Math.round(n/peak*100))+'px;background:#2478df;border-radius:3px 3px 0 0"></div>').join("")+'</div><div class="ds-muted" style="display:flex;justify-content:space-between"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>';
      const weekNames=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
      const weekdaysHtml=weekdays.map((n,i)=>'<div style="display:flex;align-items:center;gap:8px;margin:7px 0"><small style="width:32px">'+weekNames[i]+'</small><div style="flex:1;background:#eef2f8;border-radius:4px"><div style="height:13px;width:'+(n/dayPeak*100)+'%;background:#18a68d;border-radius:4px"></div></div><b style="font-size:12px;width:36px;text-align:right">'+number(n)+'</b></div>').join("");
      const attempts=count(searches,"prix"),noResult=count(["search_empty"],"prix"),searchErrors=count(["search_error"],"prix");
      const estimatedSuccess=Math.max(0,attempts-noResult-searchErrors);
      const successRate=attempts?Math.round(estimatedSuccess/attempts*100):null;
      const successHtml=tool==="reception"?'':'<section class="ds-section"><h3>Réussite des recherches Dyna Prix</h3><div class="ds-kpis"><div class="ds-kpi"><small>Taux de réussite estimé</small><strong>'+(successRate===null?'—':successRate+' %')+'</strong><em>'+number(attempts)+' recherches</em></div><div class="ds-kpi"><small>Sans résultat</small><strong>'+number(noResult)+'</strong></div><div class="ds-kpi"><small>En erreur</small><strong>'+number(searchErrors)+'</strong></div></div><p class="ds-muted">Estimation fondée sur les événements enregistrés : les recherches et leurs résultats ne sont pas reliés individuellement. Une même recherche peut produire plusieurs événements.</p></section>';
      const fail=count(["search_error"],"prix"),found=count(searches,"prix"),missing=count(["search_empty"],"prix");
      const insight=tool==="reception"?'Les articles contrôlés comptent les actions de contrôle, pas nécessairement les articles distincts.':found?'Sur '+number(found)+' recherches, '+number(missing)+' ont été signalées sans résultat et '+number(fail)+' ont généré une erreur. Les événements peuvent se recouper.':'Aucune recherche de prix enregistrée sur cette période.';
      $("ds-content").innerHTML='<p class="ds-muted">Du '+start.split("-").reverse().join("/")+' au '+end.split("-").reverse().join("/")+' · Comparaison avec les '+days+' jours précédents</p><div class="ds-kpis">'+cards+'</div><section class="ds-section"><h3>Activité quotidienne</h3><p class="ds-muted">'+(tool!=="reception"?'<i class="ds-pill" style="background:'+C.prix+'"></i>Dyna Prix':'')+(tool==="all"?' &nbsp; ':'')+(tool!=="prix"?'<i class="ds-pill" style="background:'+C.reception+'"></i>Dyna Réception':'')+' · Actions enregistrées</p><div class="ds-chart">'+graph+'</div></section><div class="ds-columns">'+(tool==="all"?'<section class="ds-section"><h3>Répartition de l’activité</h3>'+split+'</section>':'')+'<section class="ds-section"><h3>Qualité et utilisation</h3><p class="ds-note ds-muted">'+insight+'</p><p class="ds-muted">Erreurs enregistrées : <b>'+number(count(errors))+'</b> · Évolution vs période précédente : <b>'+(delta(count(errors),before(errors))===null?'non calculable':delta(count(errors),before(errors))+' %')+'</b></p></section></div>'+successHtml+'<div class="ds-columns"><section class="ds-section"><h3>Activité par heure</h3>'+hoursHtml+'</section><section class="ds-section"><h3>Activité par jour de semaine</h3>'+weekdaysHtml+'</section></div><div class="ds-columns"><section class="ds-section"><h3>Détail des fonctionnalités</h3>'+detailHtml+'</section><section class="ds-section"><h3>Versions actives</h3><p class="ds-muted">Nombre d’ouvertures par version, et non nombre d’utilisateurs ou d’installations.</p>'+versionsHtml+'</section></div><p class="ds-muted ds-section">Les chiffres proviennent des événements remontés par les outils. Ils ne permettent pas de compter les utilisateurs uniques. Les données de la journée sont partielles et la comparaison se fait par journées calendaires (heure de Paris).</p>';if($("ds-updated"))$("ds-updated").textContent="Actualisé à "+new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    }catch(e){$("ds-content").innerHTML='<p style="color:#b00020">Accès impossible (v'+VERSION+') : '+esc(e.message)+'</p><button id="ds-retry">Réessayer</button>';$("ds-retry").onclick=load}finally{loading=false}
  }
  function open(){
    if(panel){if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;panel.remove();panel=null;return}
    panel=document.createElement("div");panel.id="ds-panel";
    panel.style.cssText="position:fixed;inset:8px auto 8px 50%;transform:translateX(-50%);width:calc(100vw - 16px);max-width:460px;overflow:auto;box-sizing:border-box;background:white;color:#172033;z-index:1000002;padding:15px;border-radius:15px;box-shadow:0 8px 35px #0006;font-family:Arial,sans-serif";
    panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><div><h2 style="margin:0">📊 Dyna Stats</h2><small style="color:#8a94a6">v'+VERSION+' • 09/10/2026 • Web</small></div><button id="ds-close" style="border:0;background:transparent;font-size:22px">Déconnexion</button></div><div style="display:flex;gap:7px;margin:14px 0"><select id="ds-tool" style="flex:1;min-width:0;padding:9px"><option value="all">Les deux outils</option><option value="prix" selected>Dyna Prix</option><option value="reception">Dyna Réception</option></select><select id="ds-period" style="padding:9px"><option value="1">Aujourd’hui</option><option value="7" selected>7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option><option value="custom">Entre deux dates…</option></select></div><div id="ds-custom" style="display:none;gap:10px;flex-wrap:wrap;margin:-3px 0 14px"><label style="flex:1;min-width:130px;font-size:12px;color:#627086">Du <input type="date" id="ds-from" style="display:block;box-sizing:border-box;width:100%;padding:9px;margin-top:4px"></label><label style="flex:1;min-width:130px;font-size:12px;color:#627086">Au <input type="date" id="ds-to" style="display:block;box-sizing:border-box;width:100%;padding:9px;margin-top:4px"></label></div><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px"><small id="ds-updated" class="ds-muted">Actualisation automatique : 60 s</small><button id="ds-refresh" type="button" style="padding:7px 12px;cursor:pointer">↻ Actualiser</button></div><div id="ds-content"></div>';
    document.body.appendChild(panel);
    $("ds-close").onclick=logout;
    $("ds-tool").onchange=load;
    $("ds-period").onchange=()=>{$("ds-custom").style.display=$("ds-period").value==="custom"?"flex":"none";load()};
    $("ds-to").value=fmtDate(new Date());$("ds-from").value=shiftDate($("ds-to").value,-6);
    $("ds-from").onchange=load;$("ds-to").onchange=load;
    load();
  }
  const launch=document.createElement("button");
  launch.textContent="📊 Stats";launch.id="ds-launch";
  launch.style.cssText="position:fixed;right:18px;bottom:90px;z-index:999997;background:#26364f;color:white;border:0;border-radius:999px;padding:12px 16px;font-weight:700;box-shadow:0 4px 18px #0004;cursor:pointer";
  launch.onclick=open;document.body.appendChild(launch);
  restoreSession().then(open).catch(e=>{localStorage.removeItem(STORE);loginScreen(e.message)});

})();