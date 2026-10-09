// ==UserScript==
// @name         Dyna Prix
// @namespace    local.dynaprix
// @version      0.8.10
// @description  Recherche/scan EAN Dynacad et calcule un prix de vente TTC à partir du prix d'achat HT, de la TVA et de la majoration.
// @match        https://dynacad.carrefour.com/*
// @updateURL    https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-prix.user.js
// @downloadURL  https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-prix.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const STORAGE_MARGIN = "dynaprix-margin";
  const STORAGE_HISTORY = "dynaprix-history";
  const STORAGE_SETTINGS = "dynaprix-settings";
  const STORAGE_TORCH = "dynaprix-torch";
  let product = null;

  const euro = n => Number(n).toLocaleString("fr-FR", {
    style: "currency", currency: "EUR"
  });

  function getSiteEan() {
    const matches = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^dynacad\|[^|]+\|current_store$/.test(key)) {
        let value = localStorage.getItem(key);
        if (!value) continue;
        try { value = JSON.parse(value); } catch (_) {}
        value = String(value).replace(/^"|"$/g, "").trim();
        if (/^\d{8,14}$/.test(value)) matches.push({ key, value });
      }
    }
    if (!matches.length) {
      throw new Error("Magasin Dynacad non détecté. Sélectionnez un magasin dans Dynacad puis réessayez.");
    }
    return matches[0].value;
  }

  function getSettings() {
    const defaults = { vibration:true, sound:false, history:true, dlcControl:false };
    try { return {...defaults, ...JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}")}; }
    catch (_) { return defaults; }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  }

  async function getStoreName(siteEan) {
    try {
      const token = await authenticate();
      const r = await fetch("/api/stores/search?size=2", {
        method:"POST",
        credentials:"include",
        headers:{
          "Content-Type":"application/json",
          "Authorization":"Bearer " + token
        },
        body:JSON.stringify({filters:{}})
      });
      if (!r.ok) return "";
      const data = await r.json();
      const stores = Array.isArray(data) ? data :
        (Array.isArray(data.data) ? data.data :
        (Array.isArray(data.content) ? data.content : []));
      const store = stores.find(s => String(s?.stoEan || s?.siteEan || "") === String(siteEan));
      return store?.storeDesc || store?.label || store?.name || "";
    } catch (_) {
      return "";
    }
  }

  function showProductAnomalies() {
    const box = document.getElementById("dp-anomalies");
    if (!box || !product) return;
    const warnings = [];

    const purchase = Number(product.purchasePrice);
    if (!Number.isFinite(purchase) || purchase <= 0) warnings.push("Prix d'achat absent ou nul");

    const vat = Number(product.vatPct);
    if (!Number.isFinite(vat) || vat < 0) warnings.push("TVA absente ou invalide");

    if (product.notOrderableReason) {
      warnings.push("Produit non commandable : " + product.notOrderableReason);
    }

    const dlcc = Number(product.dlcc);
    if (product.dlcc != null && (!Number.isFinite(dlcc) || dlcc < 0)) warnings.push("DLCC invalide");

    if (warnings.length) {
      box.innerHTML = "⚠️ " + warnings.map(escapeHtml).join("<br>⚠️ ");
      box.style.display = "block";
    } else {
      box.textContent = "";
      box.style.display = "none";
    }
  }

  function scanFeedback() {
    const settings = getSettings();
    if (settings.vibration && navigator.vibrate) navigator.vibrate(80);
    if (settings.sound) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.12);
      } catch (_) {}
    }
  }

  function getCookie(name) {
    const row = document.cookie.split("; ").find(r => r.startsWith(name + "="));
    return row ? decodeURIComponent(row.split("=").slice(1).join("=")) : null;
  }

  function addLauncher() {
    if (document.getElementById("dynaprix-launcher")) return;
    const b = document.createElement("button");
    b.id = "dynaprix-launcher";
    b.textContent = "🛒 Dyna Prix";
    Object.assign(b.style, {
      position:"fixed", right:"18px", bottom:"18px", zIndex:"999998",
      border:"0", borderRadius:"999px", padding:"20px 28px",
      background:"#1769e0", color:"#fff", fontWeight:"800",
      fontSize:"20px", boxShadow:"0 5px 20px rgba(0,0,0,.25)", cursor:"pointer"
    });
    b.onclick = openApp;
    document.body.appendChild(b);
  }

  function openApp() {
    const old = document.getElementById("dynaprix-app");
    if (old) {
      if (old.style.display === "none") {
        old.style.display = "";
        return;
      }
      old.remove();
      return;
    }

    const app = document.createElement("div");
    app.id = "dynaprix-app";
    app.innerHTML = `
      <div id="dp-panel" style="position:fixed;top:6px;bottom:6px;left:50%;transform:translateX(-50%);width:calc(100vw - 12px);max-width:410px;box-sizing:border-box;
        overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#fff;color:#172033;z-index:999999;
        padding:14px 16px;border-radius:16px;box-shadow:0 8px 35px rgba(0,0,0,.28);
        font-family:Arial,sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 style="margin:0">🛒 Dyna Prix</h2><span style="font-size:11px;color:#8a94a6;font-weight:normal">v0.8.10 • 09/10/2026 15h00 <span id="dp-site-ean"></span></span></div>
          <button id="dp-close" style="border:0;background:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="color:#687386;margin:3px 0 11px">Recherche et calcul de prix</div>

        <label><b>EAN ou libellé produit</b></label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <div style="position:relative;flex:1;min-width:0">
            <input id="dp-ean" autocomplete="off" placeholder="Scanner un EAN ou saisir un libellé"
              style="width:100%;box-sizing:border-box;padding:9px 34px 9px 10px;font-size:16px;border:1px solid #bbb;border-radius:9px">
            <button id="dp-ean-clear" type="button" title="Vider l'EAN" aria-label="Vider l'EAN"
              style="display:none;position:absolute;right:5px;top:50%;transform:translateY(-50%);width:28px;height:28px;padding:0;border:0;background:transparent;color:#687386;font-size:18px;line-height:28px;cursor:pointer">✕</button>
          </div>
          <button id="dp-search" style="padding:9px 13px;background:#1769e0;color:white;border:0;
            border-radius:9px;font-weight:bold;cursor:pointer">Rechercher</button>
        </div>
        <button id="dp-scan" style="width:100%;height:58px;margin-top:7px;padding:10px;background:#172033;color:white;border:0;
          border-radius:11px;font-weight:bold;font-size:18px;cursor:pointer">📷 Scanner un code-barres</button>
        <details id="dp-barcode-box" style="display:none;margin-top:8px;border:1px solid #d7dde6;border-radius:10px;background:#fff">
          <summary style="padding:10px 12px;font-weight:bold;cursor:pointer">▤ Afficher le code-barres de cet EAN</summary>
          <div style="padding:4px 12px 12px">
            <div id="dp-barcode-msg" style="font-size:13px;color:#687386;margin-bottom:7px">Saisissez un EAN-13 ci-dessus.</div>
            <svg id="dp-barcode-svg" role="img" aria-label="Code-barres EAN-13" style="display:none;width:100%;height:auto;background:#fff"></svg>
          </div>
        </details>
        <div id="dp-camera" style="display:none;margin-top:10px">
          <video id="dp-video" playsinline muted style="width:100%;max-height:280px;background:#000;border-radius:12px"></video>
          <div style="display:flex;gap:7px;margin-top:7px">
            <button id="dp-torch" type="button" style="display:none;flex:1;padding:10px;border:1px solid #bbb;background:#fff;border-radius:9px;font-weight:bold;cursor:pointer">🔦 Allumer le flash</button>
            <button id="dp-stop" style="flex:1;padding:10px;border:1px solid #bbb;background:white;
              border-radius:9px;font-weight:bold;cursor:pointer">Arrêter la caméra</button>
          </div>
        </div>

        <div id="dp-search-results" style="display:none;margin-top:8px;border:1px solid #d7dde6;border-radius:10px;overflow:hidden;background:#fff"></div>

        <div id="dp-status" style="margin-top:7px;color:#687386"></div>

        <div id="dp-result" style="display:none">
          <hr style="margin:11px 0;border:0;border-top:1px solid #ddd">
          <h3 id="dp-label" title="Ouvrir ce produit dans Dynacad" style="margin:0 0 9px;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px"></h3>
          <div id="dp-anomalies" style="display:none;margin:0 0 10px;padding:9px 11px;background:#fff4e5;color:#8a5700;border-radius:10px;font-size:14px;font-weight:bold"></div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="background:#f3f5f8;padding:8px 10px;border-radius:10px">
              <small>Prix achat HT</small><br><b id="dp-purchase" style="font-size:19px"></b>
            </div>
            <div style="background:#f3f5f8;padding:8px 10px;border-radius:10px">
              <small>TVA</small><br><b id="dp-vat" style="font-size:19px"></b>
            </div>
          </div>

          <hr style="margin:11px 0;border:0;border-top:1px solid #ddd">
          <label><b>Majoration sur le prix d'achat HT</b></label>
          <div style="display:flex;align-items:center;gap:7px;margin-top:6px">
            <button id="dp-margin-minus5" type="button" style="height:42px;padding:0 10px;border:1px solid #bbb;background:#fff;border-radius:9px;font-size:16px;font-weight:bold;cursor:pointer">−5</button>
            <button id="dp-margin-minus1" type="button" style="height:42px;padding:0 9px;border:1px solid #bbb;background:#fff;border-radius:9px;font-size:16px;font-weight:bold;cursor:pointer">−1</button>
            <input id="dp-margin" type="number" min="0" step="0.1"
              style="width:66px;padding:7px 5px;font-size:17px;text-align:center;border:1px solid #bbb;border-radius:9px">
            <b>%</b>
            <button id="dp-margin-plus1" type="button" style="height:42px;padding:0 9px;border:1px solid #bbb;background:#fff;border-radius:9px;font-size:16px;font-weight:bold;cursor:pointer">+1</button>
            <button id="dp-margin-plus5" type="button" style="height:42px;padding:0 10px;border:1px solid #bbb;background:#fff;border-radius:9px;font-size:16px;font-weight:bold;cursor:pointer">+5</button>
          </div>

          <div style="margin-top:10px;padding:10px 13px;background:#eef4ff;border-radius:12px">
            <div style="color:#687386;font-size:17px;font-weight:bold">PRIX DE VENTE TTC PROPOSÉ</div>
            <div id="dp-salettc" style="font-size:31px;font-weight:bold;margin-top:1px"></div>
          </div>

          <div id="dp-dlc-section" style="display:none">
            <hr style="margin:11px 0;border:0;border-top:1px solid #ddd">
            <div style="font-weight:bold;font-size:16px">📅 Contrôle DLC à la réception</div>
            <div style="margin-top:4px;color:#687386">DLCC exigée : <b id="dp-dlcc" style="color:#172033"></b></div>
            <div style="margin-top:3px;color:#687386">DLC minimale acceptable : <b id="dp-dlc-min" style="color:#172033"></b></div>
            <label style="display:block;margin-top:7px"><b>DLC inscrite sur le produit</b></label>
            <div style="display:flex;gap:7px;margin-top:4px">
              <input id="dp-dlc-date" type="text" inputmode="numeric" autocomplete="off" placeholder="JJ/MM/AAAA ou JJMMAA"
                style="flex:1;min-width:0;box-sizing:border-box;padding:8px 10px;font-size:16px;border:1px solid #bbb;border-radius:9px">
              <button id="dp-dlc-calendar-btn" type="button" title="Choisir dans le calendrier"
                style="width:48px;border:1px solid #bbb;border-radius:9px;background:#fff;font-size:22px;cursor:pointer">📅</button>
              <input id="dp-dlc-calendar" type="date" tabindex="-1"
                style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px">
            </div>
            <div id="dp-dlc-result" style="display:none;margin-top:7px;padding:9px 10px;border-radius:10px;font-weight:bold"></div>
          </div>

          <div style="position:sticky;bottom:0;padding-top:10px;background:linear-gradient(transparent,#fff 28%)">
            <button id="dp-next-scan" type="button" style="width:100%;height:58px;margin-top:6px;background:#1769e0;color:#fff;border:0;border-radius:11px;font-size:18px;font-weight:bold;box-shadow:0 3px 12px rgba(0,0,0,.18);cursor:pointer">📷 Scanner le produit suivant</button>
          </div>
        </div>

        <div style="margin-top:14px;border-top:1px solid #ddd;padding-top:11px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b>🕘 Derniers produits</b>
            <button id="dp-history-clear" type="button" style="border:0;background:none;color:#687386;cursor:pointer;font-size:12px">Effacer</button>
          </div>
          <div id="dp-history" style="margin-top:6px"></div>
        </div>

        <details id="dp-settings" style="margin-top:12px;border-top:1px solid #ddd;padding-top:10px">
          <summary style="font-weight:bold;cursor:pointer">⚙️ Paramètres</summary>
          <div style="display:grid;gap:8px;margin-top:9px;font-size:14px">
            <label><input id="dp-set-vibration" type="checkbox"> Vibration après scan</label>
            <label><input id="dp-set-sound" type="checkbox"> Bip après scan</label>
            <label><input id="dp-set-history" type="checkbox"> Conserver l'historique</label>
            <label><input id="dp-set-dlc" type="checkbox"> Activer le contrôle DLC</label>
          </div>
        </details>
      </div>`;

    document.body.appendChild(app);

    const siteLabel = document.getElementById("dp-site-ean");
    try {
      const siteEan = getSiteEan();
      siteLabel.textContent = "(" + siteEan + ")";
      getStoreName(siteEan).then(storeName => {
        if (siteLabel && siteLabel.isConnected && storeName) {
          siteLabel.textContent = "(" + storeName + " • " + siteEan + ")";
        }
      });
    } catch (_) { siteLabel.textContent = "(site non détecté)"; }

    const margin = document.getElementById("dp-margin");
    margin.value = localStorage.getItem(STORAGE_MARGIN) || "35";

    document.getElementById("dp-close").onclick = () => { stopScanner(); app.style.display = "none"; };
    document.getElementById("dp-search").onclick = searchProduct;
    document.getElementById("dp-label").onclick = () => openProductInDynacad();
    document.getElementById("dp-scan").onclick = startScanner;
    document.getElementById("dp-barcode-box").addEventListener("toggle", e => { if (e.currentTarget.open) renderBarcode(); });
    const eanInput = document.getElementById("dp-ean");
    const eanClear = document.getElementById("dp-ean-clear");
    const updateEanClear = () => {
      const value = eanInput.value.trim();
      eanClear.style.display = value ? "block" : "none";
      const barcodeBox = document.getElementById("dp-barcode-box");
      if (barcodeBox) {
        const hasEan = /^\d{8,14}$/.test(value);
        barcodeBox.style.display = hasEan ? "block" : "none";
        if (!hasEan) barcodeBox.open = false;
      }
    };
    eanInput.addEventListener("input", () => { updateEanClear(); if (document.getElementById("dp-barcode-box").open) renderBarcode(); });
    updateEanClear();
    eanClear.onclick = () => {
      eanInput.value = "";
      updateEanClear();
      document.getElementById("dp-result").style.display = "none";
      document.getElementById("dp-search-results").style.display = "none";
      document.getElementById("dp-status").textContent = "";
      if (document.getElementById("dp-barcode-box").open) renderBarcode();
      eanInput.focus();
    };
    document.getElementById("dp-stop").onclick = stopScanner;
    document.getElementById("dp-ean").addEventListener("keydown", e => {
      if (e.key === "Enter") searchProduct();
    });
    margin.addEventListener("input", () => {
      localStorage.setItem(STORAGE_MARGIN, margin.value);
      calculate();
    });
    const changeMargin = delta => {
      const current = Number(margin.value) || 0;
      margin.value = Math.max(0, current + delta);
      localStorage.setItem(STORAGE_MARGIN, margin.value);
      calculate();
    };
    document.getElementById("dp-margin-minus5").onclick = () => changeMargin(-5);
    document.getElementById("dp-margin-minus1").onclick = () => changeMargin(-1);
    document.getElementById("dp-margin-plus1").onclick = () => changeMargin(1);
    document.getElementById("dp-margin-plus5").onclick = () => changeMargin(5);
    document.getElementById("dp-next-scan").onclick = () => {
      document.getElementById("dp-ean").value = "";
      document.getElementById("dp-ean").dispatchEvent(new Event("input", {bubbles:true}));
      document.getElementById("dp-result").style.display = "none";
      startScanner();
    };
    document.getElementById("dp-history-clear").onclick = () => {
      localStorage.removeItem(STORAGE_HISTORY);
      renderHistory();
    };
    document.getElementById("dp-history").onclick = e => {
      const del = e.target.closest("[data-delete-ean]");
      if (del) {
        e.stopPropagation();
        deleteHistory(del.dataset.deleteEan);
        return;
      }
      const row = e.target.closest("[data-ean]");
      if (row) {
        document.getElementById("dp-ean").value = row.dataset.ean;
        document.getElementById("dp-ean").dispatchEvent(new Event("input", {bubbles:true}));
        searchProduct();
      }
    };

    const settings = getSettings();
    const vib = document.getElementById("dp-set-vibration");
    const snd = document.getElementById("dp-set-sound");
    const hist = document.getElementById("dp-set-history");
    const dlcSet = document.getElementById("dp-set-dlc");
    vib.checked = settings.vibration;
    snd.checked = settings.sound;
    hist.checked = settings.history;
    dlcSet.checked = settings.dlcControl;
    [vib, snd, hist, dlcSet].forEach(el => el.addEventListener("change", () => {
      saveSettings({vibration:vib.checked, sound:snd.checked, history:hist.checked, dlcControl:dlcSet.checked});
      renderHistory();
      if (product) displayDlcSection();
    }));
    const dlcText = document.getElementById("dp-dlc-date");
    dlcText.addEventListener("input", () => {
      const digits = dlcText.value.replace(/\D/g, "");
      if (digits.length === 6 && /^\d{6}$/.test(dlcText.value)) {
        dlcText.value = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/20" + digits.slice(4, 6);
        dlcText.blur();
      }
      checkDlc();
    });
    const dlcCalendar = document.getElementById("dp-dlc-calendar");
    document.getElementById("dp-dlc-calendar-btn").onclick = () => {
      if (typeof dlcCalendar.showPicker === "function") dlcCalendar.showPicker();
      else dlcCalendar.click();
    };
    dlcCalendar.addEventListener("change", () => {
      if (!dlcCalendar.value) return;
      const [y, m, d] = dlcCalendar.value.split("-");
      document.getElementById("dp-dlc-date").value = d + "/" + m + "/" + y;
      checkDlc();
    });

    renderHistory();
    document.getElementById("dp-ean").focus();
  }

  function ean13Bits(ean) {
    if (!/^\d{13}$/.test(ean)) return null;
    const sum=[...ean.slice(0,12)].reduce((s,d,i)=>s+Number(d)*(i%2?3:1),0);
    if((10-(sum%10))%10!==Number(ean[12])) return null;
    const L=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"],G=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"],R=["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"],P=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL"];
    let bits="101",p=P[Number(ean[0])];for(let i=1;i<=6;i++)bits+=(p[i-1]==="L"?L:G)[Number(ean[i])];bits+="01010";for(let i=7;i<=12;i++)bits+=R[Number(ean[i])];return bits+"101";
  }
  function renderBarcode(){
    const ean=document.getElementById("dp-ean").value.trim(),svg=document.getElementById("dp-barcode-svg"),msg=document.getElementById("dp-barcode-msg"),bits=ean13Bits(ean);
    if(!bits){svg.style.display="none";msg.style.display="block";msg.textContent=/^\d{13}$/.test(ean)?"EAN-13 invalide (clé de contrôle incorrecte).":"Saisissez un EAN-13 valide ci-dessus.";return}
    const q=10,m=2,h=82,w=(95+q*2)*m;let bars="";for(let i=0;i<bits.length;i++)if(bits[i]==="1"){const g=i<3||(i>=45&&i<50)||i>=92;bars+='<rect x="'+((i+q)*m)+'" y="4" width="'+m+'" height="'+(g?90:h)+'" fill="#000"/>'}
    svg.setAttribute("viewBox","0 0 "+w+" 116");svg.innerHTML='<rect width="100%" height="100%" fill="#fff"/>'+bars+'<text x="'+(w/2)+'" y="110" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#000">'+escapeHtml(ean)+'</text>';msg.style.display="none";svg.style.display="block";
  }

  let cameraStream = null;
  let scanTimer = null;
  let torchOn = localStorage.getItem(STORAGE_TORCH) === "1";
  let torchTrack = null;

  function stopScanner() {
    torchTrack = null;
    const torchBtn = document.getElementById("dp-torch");
    if (torchBtn) {
      torchBtn.style.display = "none";
      torchBtn.textContent = torchOn ? "🔦 Éteindre le flash" : "🔦 Allumer le flash";
    }
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    const box = document.getElementById("dp-camera");
    if (box) box.style.display = "none";
  }

  async function startScanner() {
    const status = document.getElementById("dp-status");
    try {
      if (!("BarcodeDetector" in window)) {
        throw new Error("Le scanner automatique n’est pas pris en charge par ce navigateur. La saisie manuelle reste disponible.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Accès caméra indisponible dans ce navigateur.");
      }

      stopScanner();
      const supported = await BarcodeDetector.getSupportedFormats();
      const wanted = ["ean_13", "ean_8", "upc_a", "upc_e"].filter(f => supported.includes(f));
      const detector = new BarcodeDetector({ formats: wanted.length ? wanted : undefined });
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false
      });

      torchTrack = cameraStream.getVideoTracks()[0] || null;
      const torchBtn = document.getElementById("dp-torch");
      if (torchTrack) {
        const caps = typeof torchTrack.getCapabilities === "function" ? torchTrack.getCapabilities() : {};
        if (caps.torch) {
          torchBtn.style.display = "block";
          if (torchOn) {
            try {
              await torchTrack.applyConstraints({advanced:[{torch:true}]});
              torchBtn.textContent = "🔦 Éteindre le flash";
            } catch (_) {
              torchOn = false;
              localStorage.setItem(STORAGE_TORCH, "0");
              torchBtn.textContent = "🔦 Allumer le flash";
            }
          }
          torchBtn.onclick = async () => {
            try {
              torchOn = !torchOn;
              await torchTrack.applyConstraints({advanced:[{torch:torchOn}]});
              localStorage.setItem(STORAGE_TORCH, torchOn ? "1" : "0");
              torchBtn.textContent = torchOn ? "🔦 Éteindre le flash" : "🔦 Allumer le flash";
            } catch (_) {
              torchOn = false;
              localStorage.setItem(STORAGE_TORCH, "0");
              torchBtn.textContent = "🔦 Flash indisponible";
              torchBtn.disabled = true;
            }
          };
        }
      }

      const video = document.getElementById("dp-video");
      document.getElementById("dp-camera").style.display = "block";
      video.srcObject = cameraStream;
      await video.play();
      status.style.color = "#687386";
      status.textContent = "Présentez le code-barres devant la caméra…";

      let busy = false;
      scanTimer = setInterval(async () => {
        if (busy || video.readyState < 2) return;
        busy = true;
        try {
          const codes = await detector.detect(video);
          const hit = codes.find(c => /^\d{8,14}$/.test(c.rawValue || ""));
          if (hit) {
            scanFeedback();
            document.getElementById("dp-ean").value = hit.rawValue;
            document.getElementById("dp-ean").dispatchEvent(new Event("input", {bubbles:true}));
            stopScanner();
            status.textContent = "✓ Code-barres détecté : " + hit.rawValue;
            status.style.color = "green";
            await searchProduct();
          }
        } catch (_) {
          // Une image non lisible est normale pendant le scan.
        } finally { busy = false; }
      }, 350);
    } catch (err) {
      stopScanner();
      status.style.color = "#b00020";
      status.textContent = "⚠ " + err.message;
    }
  }

  function calculate() {
    if (!product) return;
    const base = Number(product.purchasePrice);
    const vat = Number(product.vatPct) || 0;
    const pct = Number(document.getElementById("dp-margin").value) || 0;
    const proposed = base * (1 + vat / 100) * (1 + pct / 100);
    document.getElementById("dp-salettc").textContent = euro(proposed);
  }

  function formatDateFR(date) {
    return String(date.getDate()).padStart(2, "0") + "/" +
      String(date.getMonth() + 1).padStart(2, "0") + "/" + date.getFullYear();
  }

  function renderHistory() {
    const box = document.getElementById("dp-history");
    if (!box) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]"); } catch (_) {}
    if (!history.length) {
      box.innerHTML = '<div style="color:#8a94a6;font-size:13px">Aucun produit pour le moment.</div>';
      return;
    }
    if (!getSettings().history) {
      box.innerHTML = '<div style="color:#8a94a6;font-size:13px">Historique désactivé.</div>';
      return;
    }
    box.innerHTML = history.slice(0, 10).map(h =>
      '<div data-ean="' + escapeHtml(h.ean) + '" style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;cursor:pointer">' +
      '<div style="display:flex;justify-content:space-between;gap:8px"><div style="font-weight:bold">' + escapeHtml(h.label) + '</div>' +
      '<button data-delete-ean="' + escapeHtml(h.ean) + '" title="Supprimer" style="border:0;background:none;color:#8a94a6;font-size:16px;cursor:pointer">✕</button></div>' +
      '<div style="color:#687386">' + escapeHtml(h.ean) + ' • Prix : <b style="color:#172033">' + escapeHtml(h.price) + '</b></div>' +
      (h.dlcDate ? '<div style="margin-top:2px;color:' + (h.dlcOk ? '#167332' : '#b00020') + '">' +
        (h.dlcOk ? '✓' : '✕') + ' DLC ' + escapeHtml(h.dlcDate) + ' — ' + (h.dlcOk ? 'Conforme' : 'Non conforme') + '</div>' : '') +
      '</div>'
    ).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function deleteHistory(ean) {
    let history = [];
    try { history = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]"); } catch (_) {}
    history = history.filter(h => h.ean !== ean);
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
    renderHistory();
  }

  function updateHistoryDlc(ean, dlcDate, dlcOk) {
    if (!getSettings().history) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]"); } catch (_) {}
    const item = history.find(h => h.ean === ean);
    if (item) {
      item.dlcDate = dlcDate;
      item.dlcOk = dlcOk;
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
      renderHistory();
    }
  }

  function addHistory(ean) {
    if (!getSettings().history) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]"); } catch (_) {}
    const base = Number(product.purchasePrice);
    const vat = Number(product.vatPct) || 0;
    const pct = Number(document.getElementById("dp-margin").value) || 0;
    const price = euro(base * (1 + vat / 100) * (1 + pct / 100));
    history = history.filter(h => h.ean !== ean);
    const brand = product.brandDesc || product.brand || "";
    const historyLabel = (brand ? brand + " • " : "") + (product.label || "Produit");
    history.unshift({ean, label:historyLabel, price});
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history.slice(0, 10)));
    renderHistory();
  }

  function checkDlc() {
    if (!product) return;
    const dlcc = Number(product.dlcc);
    const input = document.getElementById("dp-dlc-date");
    const box = document.getElementById("dp-dlc-result");
    if (!Number.isFinite(dlcc) || dlcc < 0 || !input.value) {
      box.style.display = "none";
      return;
    }

    const today = new Date();
    const reception = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const match = input.value.trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (!match) {
      box.style.display = "block";
      box.style.background = "#fff4e5";
      box.style.color = "#8a5700";
      box.textContent = "Saisissez la date au format JJ/MM/AAAA ou JJMMAA.";
      return;
    }
    const d = Number(match[1]), m = Number(match[2]), y = Number(match[3]);
    const expiry = new Date(y, m - 1, d);
    if (expiry.getFullYear() !== y || expiry.getMonth() !== m - 1 || expiry.getDate() !== d) {
      box.style.display = "block";
      box.style.background = "#fff4e5";
      box.style.color = "#8a5700";
      box.textContent = "Date invalide.";
      return;
    }
    const days = Math.round((expiry - reception) / 86400000);

    box.style.display = "block";
    if (days >= dlcc) {
      updateHistoryDlc(document.getElementById("dp-ean").value.trim(), formatDateFR(expiry), true);
      box.style.background = "#e8f7ec";
      box.style.color = "#167332";
      box.textContent = "✓ CONFORME — " + days + " jour" + (days > 1 ? "s" : "") +
        " restant" + (days > 1 ? "s" : "") + " / minimum " + dlcc + " jour" + (dlcc > 1 ? "s" : "");
    } else {
      updateHistoryDlc(document.getElementById("dp-ean").value.trim(), formatDateFR(expiry), false);
      box.style.background = "#fdebec";
      box.style.color = "#b00020";
      box.textContent = "✕ NON CONFORME — " + days + " jour" + (Math.abs(days) > 1 ? "s" : "") +
        " restant" + (Math.abs(days) > 1 ? "s" : "") + " / minimum " + dlcc + " jour" + (dlcc > 1 ? "s" : "");
    }
  }

  async function authenticate() {
    const xsrf = getCookie("XSRF-TOKEN");
    if (!xsrf) throw new Error("Session Dynacad introuvable. Reconnectez-vous à Dynacad.");
    const r = await fetch("/api/authenticate", {
      method:"POST", credentials:"include",
      headers:{"Content-Type":"application/json","x-xsrf-token":xsrf},
      body:"{}"
    });
    if (!r.ok) throw new Error("Authentification Dynacad refusée (" + r.status + ").");
    const data = await r.json();
    if (!data.id_token) throw new Error("Aucun jeton Dynacad reçu.");
    return data.id_token;
  }

  async function openProductInDynacad() {
    if (!product?.ean) return;
    const ean = String(product.ean);
    stopScanner();
    const app = document.getElementById("dynaprix-app");
    if (app) app.style.display = "none";

    const findInput = () => document.querySelector('input[placeholder="Recherche EAN, libellé, etc..."]');

    const setSearchValue = input => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, ean); else input.value = ean;
      input.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText", data:ean}));
      input.dispatchEvent(new Event("change", {bubbles:true}));
      input.focus();
    };

    const pressEnter = input => {
      input.dispatchEvent(new KeyboardEvent("keydown", {bubbles:true, cancelable:true, key:"Enter", code:"Enter", keyCode:13, which:13}));
      input.dispatchEvent(new KeyboardEvent("keypress", {bubbles:true, cancelable:true, key:"Enter", code:"Enter", keyCode:13, which:13}));
      input.dispatchEvent(new KeyboardEvent("keyup", {bubbles:true, cancelable:true, key:"Enter", code:"Enter", keyCode:13, which:13}));
    };

    // Grand écran : le champ de recherche est permanent et la recherche part avec Entrée.
    const desktopInput = findInput();
    const desktopValidate = document.querySelector("button.validate");
    if (desktopInput && !desktopValidate) {
      const clearIcon = desktopInput.closest("mat-form-field")?.querySelector('button[aria-label="Clear"]');
      if (clearIcon) clearIcon.click();
      setTimeout(() => {
        setSearchValue(desktopInput);
        setTimeout(() => pressEnter(desktopInput), 100);
      }, clearIcon ? 150 : 0);
      return;
    }

    // Mobile : la fenêtre de recherche peut déjà être ouverte.
    if (desktopInput && desktopValidate) {
      const clearBtn = document.querySelector("button.clear");
      if (clearBtn) clearBtn.click();
      setTimeout(() => {
        setSearchValue(desktopInput);
        pressEnter(desktopInput);
        setTimeout(() => {
          desktopInput.dispatchEvent(new Event("blur", {bubbles:true}));
          desktopValidate.click();
        }, 700);
      }, clearBtn ? 350 : 0);
      return;
    }

    // Mobile : ouvrir d'abord la recherche avec la loupe.
    const searchIcon = [...document.querySelectorAll("button.menu-button mat-icon")]
      .find(el => el.textContent.trim() === "search");
    const searchButton = searchIcon?.closest("button");
    if (!searchButton) {
      alert("Dyna Prix : recherche Dynacad introuvable.");
      return;
    }
    searchButton.click();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const input = findInput();
      const validate = document.querySelector("button.validate");
      const clearBtn = document.querySelector("button.clear");
      if (input && validate) {
        clearInterval(timer);
        if (clearBtn) clearBtn.click();
        setTimeout(() => {
          setSearchValue(input);
          pressEnter(input);
          setTimeout(() => {
            input.dispatchEvent(new Event("blur", {bubbles:true}));
            validate.click();
          }, 700);
        }, clearBtn ? 350 : 0);
      } else if (attempts >= 30) {
        clearInterval(timer);
        alert("Dyna Prix : fenêtre de recherche Dynacad introuvable.");
      }
    }, 100);
  }

  function displayDlcSection() {
    const dlcSection = document.getElementById("dp-dlc-section");
    if (!dlcSection || !product) return;
    const dlcc = Number(product.dlcc);
    const enabled = getSettings().dlcControl;
    if (enabled && Number.isFinite(dlcc) && dlcc >= 0) {
      document.getElementById("dp-dlcc").textContent = dlcc + " jour" + (dlcc > 1 ? "s" : "");
      const minDate = new Date();
      minDate.setHours(0,0,0,0);
      minDate.setDate(minDate.getDate() + dlcc);
      document.getElementById("dp-dlc-min").textContent = formatDateFR(minDate);
      dlcSection.style.display = "block";
    } else {
      dlcSection.style.display = "none";
    }
  }

  function displayProduct(p, ean) {
    product = p;
    const brand = product.brandDesc || product.brand || "";
    document.getElementById("dp-label").textContent = (brand ? brand + " • " : "") + (product.label || "Produit");
    document.getElementById("dp-purchase").textContent = euro(product.purchasePrice);
    document.getElementById("dp-vat").textContent = (Number(product.vatPct) || 0).toLocaleString("fr-FR") + " %";
    showProductAnomalies();
    const dlcInput = document.getElementById("dp-dlc-date"), dlcResult = document.getElementById("dp-dlc-result");
    dlcInput.value = ""; dlcResult.style.display = "none";
    displayDlcSection();
    document.getElementById("dp-result").style.display = "block";
    calculate(); addHistory(ean);
  }

  async function loadSearchThumbnail(ean, img, token) {
    try {
      const r = await fetch("/api/pictures/" + encodeURIComponent(ean) + "/quality/miniature", {
        credentials:"include",
        headers:{"Authorization":"Bearer " + token}
      });
      if (!r.ok) throw new Error("Miniature " + r.status);
      const pic = await r.json();
      if (!pic?.data) throw new Error("Miniature vide");
      img.src = "data:" + (pic.contentType || "image/jpeg") + ";base64," + pic.data;
    } catch (_) {
      img.style.display = "none";
      const fallback = img.parentElement?.querySelector("[data-photo-fallback]");
      if (fallback) fallback.style.display = "flex";
    }
  }

  async function searchProduct() {
    const status = document.getElementById("dp-status"), result = document.getElementById("dp-result"), results = document.getElementById("dp-search-results");
    const query = document.getElementById("dp-ean").value.trim(), isEan = /^\d{8,14}$/.test(query);
    status.style.color = "#687386"; status.style.fontWeight = "normal"; status.textContent = "Recherche en cours…"; result.style.display = "none"; results.style.display = "none";
    try {
      if (!query) throw new Error("Saisissez un EAN ou un libellé.");
      const token = await authenticate(), siteEan = getSiteEan();
      const payload = {
        siteEan, pageIndex:0, pageSize:isEan ? 10 : 20,
        sorts:[{property:"sectorDesc",direction:"asc"},{property:"departmentDesc",direction:"asc"},{property:"classGroupDesc",direction:"asc"},{property:"classDesc",direction:"asc"},{property:"subClassDesc",direction:"asc"},{property:"assortmentLevel",direction:"asc"},{property:"label",direction:"asc"}],
        filters:isEan ? {ean:[query]} : {}
      };
      if (!isEan) payload.queries = {labelAll:[query]};
      const r = await fetch("/api/products/search", {method:"POST",credentials:"include",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(payload)});
      if (!r.ok) throw new Error("Recherche Dynacad impossible (" + r.status + ").");
      const data = await r.json();
      if (!data.data?.length) throw new Error("Aucun produit trouvé.");
      if (isEan) {
        displayProduct(data.data[0], query); status.textContent = "✓ Produit trouvé"; status.style.color = "green"; return;
      }
      const list = [], seen = new Set();
      for (const p of data.data) { const key = String(p.ean || ""); if (key && !seen.has(key)) { seen.add(key); list.push(p); } }
      const total = Number(data.total) || list.length;
      let nextPage = 1;
      const renderResults = () => {
        results.innerHTML = list.map((p,i) => {
          const brand = p.brandDesc || p.brand || "";
          return '<div data-result-index="'+i+'" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #eee;cursor:pointer">'+
            '<div style="width:64px;height:52px;flex:0 0 64px;border-radius:8px;background:#f3f5f8;overflow:hidden;display:flex;align-items:center;justify-content:center">'+
              '<img data-photo-ean="'+escapeHtml(p.ean||"")+'" alt="" style="display:block;width:100%;height:100%;object-fit:contain;background:#fff">'+
              '<div data-photo-fallback style="display:none;width:100%;height:100%;align-items:center;justify-content:center;color:#a0a8b5;font-size:22px">▧</div>'+
            '</div>'+
            '<div style="min-width:0;flex:1"><b>'+escapeHtml((brand ? brand+" • " : "")+(p.label||"Produit"))+'</b><br><small style="color:#687386">EAN '+escapeHtml(p.ean||"")+' • Prix d’achat HT '+escapeHtml(euro(p.purchasePrice))+'</small></div></div>';
        }).join("") + (nextPage * 20 < total ? '<button id="dp-load-more" type="button" style="width:100%;padding:12px;border:0;border-top:1px solid #ddd;background:#f3f6fa;color:#0050a4;font-weight:700;cursor:pointer">Afficher + de résultats</button>' : "");
        results.style.display = "block";
        results.querySelectorAll("img[data-photo-ean]").forEach(img => loadSearchThumbnail(img.dataset.photoEan, img, token));
        status.textContent = list.length + " produit" + (list.length > 1 ? "s" : "") + " affiché" + (list.length > 1 ? "s" : "") + (total > list.length ? " sur " + total : "") + " — choisissez un produit.";
      };
      renderResults();
      results.onclick = async ev => {
        const more = ev.target.closest("#dp-load-more");
        if (more) {
          more.disabled = true; more.textContent = "Chargement…";
          try {
            const morePayload = {...payload, pageIndex:nextPage, pageSize:20};
            const mr = await fetch("/api/products/search", {method:"POST",credentials:"include",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(morePayload)});
            if (!mr.ok) throw new Error("Recherche Dynacad impossible (" + mr.status + ").");
            const md = await mr.json();
            for (const p of (md.data || [])) { const key = String(p.ean || ""); if (key && !seen.has(key)) { seen.add(key); list.push(p); } }
            nextPage++;
            renderResults();
          } catch (err) {
            more.disabled = false; more.textContent = "Afficher + de résultats";
            status.textContent = "⚠ " + err.message; status.style.color = "#b00020";
          }
          return;
        }
        const row = ev.target.closest("[data-result-index]"); if (!row) return;
        const p = list[Number(row.dataset.resultIndex)]; if (!p) return;
        const input = document.getElementById("dp-ean"); input.value = String(p.ean || ""); input.dispatchEvent(new Event("input",{bubbles:true}));
        results.style.display = "none"; displayProduct(p, String(p.ean || ""));
        status.textContent = "✓ Produit sélectionné"; status.style.color = "green";
      };
    } catch (err) {
      status.textContent = "⚠ " + err.message;
      status.style.color = "#b00020";
      status.style.fontWeight = err.message === "Aucun produit trouvé." ? "800" : "normal";
    }
  }

  addLauncher();
})();
