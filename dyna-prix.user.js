// ==UserScript==
// @name         Dyna Prix
// @namespace    local.dynaprix
// @version      0.5.0
// @description  Recherche/scan EAN Dynacad et calcule un prix de vente TTC à partir du prix d'achat HT, de la TVA et de la majoration.
// @match        https://dynacad.carrefour.com/*
// @updateURL    https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-prix.user.js
// @downloadURL  https://raw.githubusercontent.com/oreaweb/dyna-prix/main/dyna-prix.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const SITE_EAN = "3020180368049";
  const STORAGE_MARGIN = "dynaprix-margin";
  const STORAGE_HISTORY = "dynaprix-history";
  let product = null;

  const euro = n => Number(n).toLocaleString("fr-FR", {
    style: "currency", currency: "EUR"
  });

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
    if (old) { old.remove(); return; }

    const app = document.createElement("div");
    app.id = "dynaprix-app";
    app.innerHTML = `
      <div id="dp-panel" style="position:fixed;top:6px;bottom:6px;left:50%;transform:translateX(-50%);width:calc(100vw - 12px);max-width:410px;box-sizing:border-box;
        overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#fff;color:#172033;z-index:999999;
        padding:14px 16px;border-radius:16px;box-shadow:0 8px 35px rgba(0,0,0,.28);
        font-family:Arial,sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><h2 style="margin:0">🛒 Dyna Prix</h2><span style="font-size:11px;color:#8a94a6;font-weight:normal">v0.5.0 • 05/10/2026 19h49</span></div>
          <button id="dp-close" style="border:0;background:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="color:#687386;margin:3px 0 11px">Recherche et calcul de prix</div>

        <label><b>Code-barres EAN</b></label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input id="dp-ean" inputmode="numeric" autocomplete="off" placeholder="Scanner ou saisir l'EAN"
            style="flex:1;min-width:0;padding:9px 10px;font-size:16px;border:1px solid #bbb;border-radius:9px">
          <button id="dp-search" style="padding:9px 13px;background:#1769e0;color:white;border:0;
            border-radius:9px;font-weight:bold;cursor:pointer">Rechercher</button>
        </div>
        <button id="dp-scan" style="width:100%;height:58px;margin-top:7px;padding:10px;background:#172033;color:white;border:0;
          border-radius:11px;font-weight:bold;font-size:18px;cursor:pointer">📷 Scanner un code-barres</button>
        <div id="dp-camera" style="display:none;margin-top:10px">
          <video id="dp-video" playsinline muted style="width:100%;max-height:280px;background:#000;border-radius:12px"></video>
          <button id="dp-stop" style="width:100%;margin-top:7px;padding:10px;border:1px solid #bbb;background:white;
            border-radius:9px;font-weight:bold;cursor:pointer">Arrêter la caméra</button>
        </div>

        <div id="dp-status" style="margin-top:7px;color:#687386"></div>

        <div id="dp-result" style="display:none">
          <hr style="margin:11px 0;border:0;border-top:1px solid #ddd">
          <h3 id="dp-label" style="margin:0 0 9px"></h3>

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
            <button id="dp-margin-minus" type="button" style="width:48px;height:42px;border:1px solid #bbb;background:#fff;border-radius:9px;font-size:22px;font-weight:bold;cursor:pointer">−</button>
            <input id="dp-margin" type="number" min="0" step="0.1"
              style="width:82px;padding:7px 8px;font-size:17px;text-align:center;border:1px solid #bbb;border-radius:9px">
            <b>%</b>
            <button id="dp-margin-plus" type="button" style="width:48px;height:42px;border:1px solid #bbb;background:#fff;border-radius:9px;font-size:22px;font-weight:bold;cursor:pointer">+</button>
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
              <input id="dp-dlc-date" type="text" inputmode="numeric" autocomplete="off" placeholder="JJ/MM/AAAA"
                style="flex:1;min-width:0;box-sizing:border-box;padding:8px 10px;font-size:16px;border:1px solid #bbb;border-radius:9px">
              <button id="dp-dlc-calendar-btn" type="button" title="Choisir dans le calendrier"
                style="width:48px;border:1px solid #bbb;border-radius:9px;background:#fff;font-size:22px;cursor:pointer">📅</button>
              <input id="dp-dlc-calendar" type="date" tabindex="-1"
                style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px">
            </div>
            <div id="dp-dlc-result" style="display:none;margin-top:7px;padding:9px 10px;border-radius:10px;font-weight:bold"></div>
          </div>

          <button id="dp-next-scan" type="button" style="width:100%;height:54px;margin-top:14px;background:#1769e0;color:#fff;border:0;border-radius:11px;font-size:18px;font-weight:bold;cursor:pointer">📷 Scanner le produit suivant</button>
        </div>

        <div style="margin-top:14px;border-top:1px solid #ddd;padding-top:11px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b>🕘 Derniers produits</b>
            <button id="dp-history-clear" type="button" style="border:0;background:none;color:#687386;cursor:pointer;font-size:12px">Effacer</button>
          </div>
          <div id="dp-history" style="margin-top:6px"></div>
        </div>
      </div>`;

    document.body.appendChild(app);

    const margin = document.getElementById("dp-margin");
    margin.value = localStorage.getItem(STORAGE_MARGIN) || "35";

    document.getElementById("dp-close").onclick = () => { stopScanner(); app.remove(); };
    document.getElementById("dp-search").onclick = searchProduct;
    document.getElementById("dp-scan").onclick = startScanner;
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
    document.getElementById("dp-margin-minus").onclick = () => changeMargin(-5);
    document.getElementById("dp-margin-plus").onclick = () => changeMargin(5);
    document.getElementById("dp-next-scan").onclick = () => {
      document.getElementById("dp-ean").value = "";
      document.getElementById("dp-result").style.display = "none";
      startScanner();
    };
    document.getElementById("dp-history-clear").onclick = () => {
      localStorage.removeItem(STORAGE_HISTORY);
      renderHistory();
    };
    const dlcText = document.getElementById("dp-dlc-date");
    dlcText.addEventListener("input", () => {
      const digits = dlcText.value.replace(/\D/g, "");
      if (digits.length === 6 && /^\d{6}$/.test(dlcText.value)) {
        dlcText.value = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/20" + digits.slice(4, 6);
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

  let cameraStream = null;
  let scanTimer = null;

  function stopScanner() {
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
            document.getElementById("dp-ean").value = hit.rawValue;
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
    box.innerHTML = history.slice(0, 10).map(h =>
      '<div style="padding:7px 0;border-bottom:1px solid #eee;font-size:13px">' +
      '<div style="font-weight:bold">' + escapeHtml(h.label) + '</div>' +
      '<div style="color:#687386">' + escapeHtml(h.ean) + ' • Prix proposé : <b style="color:#172033">' + escapeHtml(h.price) + '</b></div></div>'
    ).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function addHistory(ean) {
    let history = [];
    try { history = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]"); } catch (_) {}
    const base = Number(product.purchasePrice);
    const vat = Number(product.vatPct) || 0;
    const pct = Number(document.getElementById("dp-margin").value) || 0;
    const price = euro(base * (1 + vat / 100) * (1 + pct / 100));
    history = history.filter(h => h.ean !== ean);
    history.unshift({ean, label:product.label || "Produit", price});
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
      box.textContent = "Saisissez la date au format JJ/MM/AAAA.";
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
      box.style.background = "#e8f7ec";
      box.style.color = "#167332";
      box.textContent = "✓ CONFORME — " + days + " jour" + (days > 1 ? "s" : "") +
        " restant" + (days > 1 ? "s" : "") + " / minimum " + dlcc + " jour" + (dlcc > 1 ? "s" : "");
    } else {
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

  async function searchProduct() {
    const status = document.getElementById("dp-status");
    const result = document.getElementById("dp-result");
    const ean = document.getElementById("dp-ean").value.trim();

    status.style.color = "#687386";
    status.textContent = "Recherche en cours…";
    result.style.display = "none";

    try {
      if (!/^\d{8,14}$/.test(ean)) throw new Error("EAN invalide.");
      const token = await authenticate();

      const payload = {
        siteEan:SITE_EAN, pageIndex:0, pageSize:10,
        sorts:[
          {property:"sectorDesc",direction:"asc"},
          {property:"departmentDesc",direction:"asc"},
          {property:"classGroupDesc",direction:"asc"},
          {property:"classDesc",direction:"asc"},
          {property:"subClassDesc",direction:"asc"},
          {property:"assortmentLevel",direction:"asc"},
          {property:"label",direction:"asc"}
        ],
        filters:{ean:[ean]}
      };

      const r = await fetch("/api/products/search", {
        method:"POST", credentials:"include",
        headers:{"Content-Type":"application/json","Authorization":"Bearer " + token},
        body:JSON.stringify(payload)
      });

      if (!r.ok) throw new Error("Recherche Dynacad impossible (" + r.status + ").");
      const data = await r.json();
      if (!data.data?.length) throw new Error("Produit introuvable.");

      product = data.data[0];
      document.getElementById("dp-label").textContent = product.label || "Produit";
      document.getElementById("dp-purchase").textContent = euro(product.purchasePrice);
      document.getElementById("dp-vat").textContent =
        (Number(product.vatPct) || 0).toLocaleString("fr-FR") + " %";

      const dlcc = Number(product.dlcc);
      const dlcSection = document.getElementById("dp-dlc-section");
      const dlcInput = document.getElementById("dp-dlc-date");
      const dlcResult = document.getElementById("dp-dlc-result");
      dlcInput.value = "";
      dlcResult.style.display = "none";
      if (Number.isFinite(dlcc) && dlcc >= 0) {
        document.getElementById("dp-dlcc").textContent = dlcc + " jour" + (dlcc > 1 ? "s" : "");
        const minDate = new Date();
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() + dlcc);
        document.getElementById("dp-dlc-min").textContent = formatDateFR(minDate);
        dlcSection.style.display = "block";
      } else {
        dlcSection.style.display = "none";
      }

      result.style.display = "block";
      status.textContent = "✓ Produit trouvé";
      status.style.color = "green";
      calculate();
      addHistory(ean);
    } catch (err) {
      status.textContent = "⚠ " + err.message;
      status.style.color = "#b00020";
    }
  }

  addLauncher();
})();
