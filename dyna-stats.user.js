// ==UserScript==
// @name         Dyna Stats
// @namespace    local.dynastats
// @version      0.1.2
// @description  Statistiques globales Dyna Prix et Dyna Réception — accès administrateur.
// @match        https://dynacad.carrefour.com/*
// @updateURL    https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-stats.user.js
// @downloadURL  https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-stats.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(() => {
  "use strict";
  const URL="https://npgxpdcedhmouhduphte.supabase.co";
  const KEY="sb_publishable_F03AVvc9_J9CiMDzrPKDzQ_wczs5Zfp";
  const VERSION="0.1.2";
  let token="";
  let refreshToken="";
  let panel=null;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const label={open:"Ouvertures",search_ean:"Recherches EAN",search_label:"Recherches libellé",search_empty:"Sans résultat",search_error:"Erreurs recherche",scan:"Scans",price_calculated:"Calculs de prix",reception_loaded:"Réceptions chargées",reception_item:"Articles contrôlés",reception_unexpected:"Produits non prévus",reception_report:"Bilans consultés",reception_sync_error:"Erreurs de synchronisation"};
  async function request(path,opt={}) {
    const r=await fetch(URL+path,{...opt,headers:{"apikey":KEY,"Content-Type":"application/json",...(token?{"Authorization":"Bearer "+token}:{}),...(opt.headers||{})}});
    const body=await r.json().catch(()=>null);
    if(!r.ok)throw Error(body?.msg||body?.message||body?.error_description||"HTTP "+r.status);
    return body;
  }
  async function load(){
    if(!panel)return;
    $("ds-content").innerHTML='<div style="color:#687386;padding:12px">Chargement des statistiques…</div>';
    try{
      const days=Number($("ds-period").value),tool=$("ds-tool").value;
      const rows=await request("/rest/v1/rpc/dyna_stats_summary",{method:"POST",body:JSON.stringify({days_back:days})});
      if(!Array.isArray(rows))throw Error("Réponse inattendue");
      const filtered=rows.filter(r=>tool==="all"||r.tool===tool);
      const totals=new Map(),byDay=new Map(),byVersion=new Map();
      for(const r of filtered){
        const n=Number(r.total)||0;
        totals.set(r.event,(totals.get(r.event)||0)+n);
        byDay.set(r.day,(byDay.get(r.day)||0)+n);
        const key=(r.tool==="prix"?"Prix ":"Réception ")+r.version;
        byVersion.set(key,(byVersion.get(key)||0)+n);
      }
      const all=[...totals.values()].reduce((a,b)=>a+b,0);
      const max=Math.max(1,...byDay.values());
      const daysList=[...byDay].sort((a,b)=>a[0].localeCompare(b[0]));
      const cards=[...totals].sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div style="background:#f3f5f8;border-radius:10px;padding:12px"><div style="font-size:12px;color:#687386">'+esc(label[k]||k)+'</div><b style="font-size:23px">'+v.toLocaleString("fr-FR")+'</b></div>').join("");
      const graph=daysList.map(([day,n])=>'<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><small style="width:53px;color:#687386">'+esc(day.slice(5))+'</small><div style="height:17px;background:#1769e0;border-radius:4px;width:'+Math.max(2,Math.round(n/max*100))+'%"></div><small>'+n+'</small></div>').join("");
      const versions=[...byVersion].sort((a,b)=>b[1]-a[1]).map(([v,n])=>'<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee"><span>'+esc(v)+'</span><b>'+n+'</b></div>').join("");
      $("ds-content").innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><b>'+all.toLocaleString("fr-FR")+' événements</b><span style="font-size:12px;color:#687386">Accès libre</span></div><p style="color:#687386;font-size:12px;margin:5px 0 12px">Comptages globaux, sans suivi des appareils ou des vendeurs. Les versions représentent les événements enregistrés, pas le nombre d’installations.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+(cards||'<p>Aucune activité enregistrée.</p>')+'</div><h3 style="margin:18px 0 9px">Activité par jour</h3>'+(graph||'<p>Aucune donnée.</p>')+'<h3 style="margin:18px 0 9px">Versions utilisées</h3>'+(versions||'<p>Aucune donnée.</p>');

    }catch(e){$("ds-content").innerHTML='<p style="color:#b00020">Accès impossible : '+esc(e.message)+'</p><p style="color:#687386">Vérifie ta connexion et réessaie.</p><button id="ds-retry">Réessayer</button>';$("ds-retry").onclick=load}
  }
  function open(){
    if(panel){panel.remove();panel=null;return}
    panel=document.createElement("div");panel.id="ds-panel";
    panel.style.cssText="position:fixed;inset:8px auto 8px 50%;transform:translateX(-50%);width:calc(100vw - 16px);max-width:460px;overflow:auto;box-sizing:border-box;background:white;color:#172033;z-index:1000002;padding:15px;border-radius:15px;box-shadow:0 8px 35px #0006;font-family:Arial,sans-serif";
    panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><div><h2 style="margin:0">📊 Dyna Stats</h2><small style="color:#8a94a6">v'+VERSION+' • 09/10/2026 20h15</small></div><button id="ds-close" style="border:0;background:transparent;font-size:22px">✕</button></div><div style="display:flex;gap:7px;margin:14px 0"><select id="ds-tool" style="flex:1;min-width:0;padding:9px"><option value="all">Les deux outils</option><option value="prix">Dyna Prix</option><option value="reception">Dyna Réception</option></select><select id="ds-period" style="padding:9px"><option value="1">24 h</option><option value="7" selected>7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option></select></div><div id="ds-content"></div>';
    document.body.appendChild(panel);
    $("ds-close").onclick=()=>{panel.remove();panel=null};
    $("ds-tool").onchange=load;
    $("ds-period").onchange=load;
    load();
  }
  const launch=document.createElement("button");
  launch.textContent="📊 Stats";launch.id="ds-launch";
  launch.style.cssText="position:fixed;right:18px;bottom:90px;z-index:999997;background:#26364f;color:white;border:0;border-radius:999px;padding:12px 16px;font-weight:700;box-shadow:0 4px 18px #0004;cursor:pointer";
  launch.onclick=open;document.body.appendChild(launch);

})();