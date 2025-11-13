/* =================== AI 開關與後端位址 =================== */
const ENABLE_AI = true; // 真 AI（Cloudflare Worker）→ true；只用本地規則摘要 → false
const AI_API_BASE = "https://restless-glade-9412.peienli-tw.workers.dev"; // ← 你的 Worker 網址

/* =================== 資料路徑（GitHub Raw CSV） =================== */
const CSV_DEFINITIONS     = "https://raw.githubusercontent.com/PN0929/globalhousingdata/3c9bdf0d7ad4bd2cc65b670a45ddc99ffc0d3de9/data/social_housing_definitions_clean_utf8.csv";
const CSV_ELIGIBILITY     = "https://raw.githubusercontent.com/PN0929/globalhousingdata/main/data/social_rental_housing_eligibility_clean_utf8.csv";
const CSV_REASSESSMENT    = "https://raw.githubusercontent.com/PN0929/globalhousingdata/main/data/social_rental_housing_reassessment_clean_utf8.csv";
const CSV_PRIORITY        = "https://raw.githubusercontent.com/PN0929/globalhousingdata/main/data/social_rental_priority_allocation_clean_utf8.csv";
const CSV_CHARACTERISTICS = "https://raw.githubusercontent.com/PN0929/globalhousingdata/main/data/social_rental_characteristics_clean_utf8.csv";

/* =================== 小工具 =================== */
const $  = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));
function escapeHTML(s){ return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
function shortText(s,n=180){ if(!s)return""; const c=s.replace(/\s+/g," ").trim(); if(c.length<=n)return c; const cut=c.slice(0,n); const d=Math.max(cut.lastIndexOf("."),cut.lastIndexOf("。")); return (d>60?cut.slice(0,d+1):cut+"…"); }
function countryParam(name){ return encodeURIComponent(String(name||"").replace(/\s+/g," ").trim()); }

/* CSV 解析（支援 BOM / 引號 / 逗號 / 換行） */
function csvParse(text){
  if (!text) return [];
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // 去 BOM
  const rows=[]; let cur=[],cell="",inQ=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(inQ){
      if(c==='"'&&n==='"'){ cell+='"'; i++; }
      else if(c==='"'){ inQ=false; }
      else{ cell+=c; }
    }else{
      if(c==='"'){ inQ=true; }
      else if(c===','){ cur.push(cell); cell=""; }
      else if(c==='\n'){ cur.push(cell); rows.push(cur); cur=[]; cell=""; }
      else if(c!=='\r'){ cell+=c; }
    }
  }
  if(cell || cur.length){ cur.push(cell); rows.push(cur); }
  return rows;
}

/* 標頭正規化 & 欄位別名 */
function normKey(s){ return String(s||"").replace(/^\uFEFF/,"").toLowerCase().replace(/[^a-z0-9]/g,""); }
function idxByAliases(headers, aliases){
  const keys = headers.map(h => normKey(h));
  for (const a of aliases){ const i = keys.indexOf(a); if (i !== -1) return i; }
  return -1;
}

/* 強韌搜尋：去重音/小寫/非字元換空白 */
function normSearch(s){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

/* =================== 路由 =================== */
window.addEventListener("DOMContentLoaded", () => {
  ensureTopnavActive();
  renderRoute();
  window.addEventListener("hashchange", () => { ensureTopnavActive(); renderRoute(); });
});

function ensureTopnavActive(){
  const m = (location.hash.replace(/^#\//,"") || "").split("?")[0] || "home";
  $$(".topnav .nav-link").forEach(a=>a.classList.remove("active"));
  const el = $(`.topnav .nav-link[data-route="${m}"]`);
  if(el) el.classList.add("active");
}

function renderRoute(){
  const hash = (location.hash || "#/").replace(/^#/, "");
  const main = $(".main-content"); if(!main) return;
  main.innerHTML = "";

  if(hash.startsWith("/definitions"))       renderDefinitions(main);
  else if(hash.startsWith("/eligibility"))  renderEligibility(main);
  else if(hash.startsWith("/reassessment")) renderReassessment(main, getQueryParams(hash));
  else if(hash.startsWith("/priority"))     renderPriority(main, getQueryParams(hash));
  else if(hash.startsWith("/characteristics")) renderCharacteristics(main, getQueryParams(hash));
  else if(hash.startsWith("/ai"))           renderAiPage(main);  // AI 對話路由
  else renderHome(main);
}

function getQueryParams(hash){
  const qIndex = hash.indexOf("?"); const out = {};
  if(qIndex === -1) return out;
  const q = hash.slice(qIndex+1);
  q.split("&").forEach(kv=>{
    const [k,v] = kv.split("=");
    out[decodeURIComponent(k||"")] = decodeURIComponent((v||"").replace(/\+/g," "));
  });
  return out;
}

/* =================== 首頁 =================== */
const TOPICS = [
  { slug: "definitions",     emoji: "🏘️", title: "各國社宅定義",     desc: "各國對 social housing 的稱呼與定義，比較差異",     available: true,  cta: "開始探索" },
  { slug: "eligibility",     emoji: "🧾", title: "社宅申請資格",     desc: "誰能申請？收入門檻、公民/PR、在地居住等一覽",       available: true,  cta: "查看矩陣" },
  { slug: "reassessment",    emoji: "🔄", title: "再審查頻率",       desc: "租戶多久需要重新審查？各國規定與備註",             available: true,  cta: "查看頻率" },
  { slug: "priority",        emoji: "🎯", title: "優先分配條件",     desc: "等待名單、身心障礙、長者、族群等優先規則",           available: true,  cta: "查看條件" },
  { slug: "characteristics", emoji: "🏷️", title: "社宅特徵",         desc: "定價方式 / 租金調整 / 相對市價％ / 購屋權",         available: true,  cta: "查看特徵" },
  { slug: "ai",              emoji: "🤖", title: "AI 對話",           desc: "就資料庫問比較、是否存在、差異與國別摘要",           available: true,  cta: "開始對話" },
];

function renderHome(root){
  const wrap = document.createElement("section");
  wrap.className = "home fade-in";
  wrap.innerHTML = `
    <div class="home-hero">
      <h2>主題總覽</h2>
      <p>點擊主題卡即可進入對應頁面。未來會再擴充更多住宅主題。</p>
    </div>
    <div class="topics" id="topicsGrid"></div>
  `;
  root.appendChild(wrap);
  const grid = $("#topicsGrid", wrap);
  grid.innerHTML = TOPICS.map(t => `
    <article class="topic-card" data-slug="${t.slug}">
      <div class="topic-emoji">${t.emoji}</div>
      <div class="topic-title">${escapeHTML(t.title)}</div>
      <div class="topic-desc">${escapeHTML(t.desc)}</div>
      <div class="topic-actions"><button class="btn primary">${t.cta}</button></div>
    </article>
  `).join("");
  grid.addEventListener("click",(e)=>{ const card = e.target.closest(".topic-card"); if(!card) return; location.hash = `#/${card.dataset.slug}`; });
}

/* =================== 社宅定義 =================== */
const TAG_RULES = [
  { key:"HasPublicProvider",    label:"公部門提供",     regex:/(public|municipal|state[-\s]?owned|government|local authority|authorities)/i },
  { key:"HasNonProfitProvider", label:"非營利/合作社",   regex:/(non[-\s]?profit|co-?operative|cooperative)/i },
  { key:"HasBelowMarketRent",   label:"低於市價/租控",    regex:/(below market|rent cap|capped rent|regulated rent|moderate rent)/i },
  { key:"HasIncomeTargeting",   label:"收入審查/目標族群", regex:/(income limit|low[-\s]?income|vulnerable|eligible|means[-\s]?test)/i },
  { key:"HasSubsidyOrLoans",    label:"補貼/貸款/稅優惠",  regex:/(subsid(y|ies)|grant(s)?|loan(s)?|tax|preferential rate)/i },
  { key:"LegalDefined",         label:"法律定義",         regex:/(law|act|defined in law|regulation|legal)/i },
];
const DefState = { data:[], filtered:[], selectedTags:new Set(), selectedCountry:"ALL", searchText:"" };

async function renderDefinitions(root){
  const section = document.createElement("section"); section.id="definitionsExplorer";
  section.innerHTML = `
    <div class="controls fade-in">
      <div class="searchbox"><input id="def_search" type="text" placeholder="搜尋國家、稱呼或定義關鍵字…" /></div>
      <div class="selectbox"><select id="def_country"></select></div>
      <div class="tags" id="def_tags"></div>
      <div class="modebox">
        <a class="btn" href="#/eligibility">→ 申請資格</a>
        <a class="btn" href="#/reassessment">→ 再審查頻率</a>
        <a class="btn" href="#/priority">→ 優先分配</a>
        <a class="btn" href="#/characteristics">→ 社宅特徵</a>
      </div>
    </div>
    <div id="def_cards" class="cards fade-in"></div>
    <div id="def_empty" class="empty" style="display:none;">找不到符合條件的結果</div>
  `;
  root.appendChild(section);

  await loadDefinitions();
  buildDefControls();
  renderDefCards(); // 不自動生成 AI 摘要，改為點擊後才生成
}

async function loadDefinitions(){
  let text="";
  try{
    const resp = await fetch(CSV_DEFINITIONS,{cache:"no-store"}); if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
  }catch(err){ console.error("Fetch CSV_DEFINITIONS failed:", err); DefState.data=[]; DefState.filtered=[]; return; }

  const rows = csvParse(text);
  if(!rows.length){ DefState.data=[]; DefState.filtered=[]; return; }

  const headers = rows[0];
  const iC = idxByAliases(headers, ["country"]);
  const iT = idxByAliases(headers, ["termsused","term(s)used","terms"]);
  const iD = idxByAliases(headers, ["definition","definitionandsummaryoverview","definitionoverview"]);

  const raw = rows.slice(1).map(r=>{
    const Country=(r[iC]||"").trim(), TermsUsed=((iT>=0?r[iT]:"")||"").trim(), Definition=(iD>=0?(r[iD]||""):"").trim();
    if(!Country || !Definition) return null;
    const flags={}; TAG_RULES.forEach(rule=>flags[rule.key]=rule.regex.test(`${TermsUsed}\n${Definition}`));
    return { Country, TermsUsed, Definition, short: shortText(Definition,200), flags };
  }).filter(Boolean);

  const map = new Map();
  for(const it of raw){
    if(!map.has(it.Country)) map.set(it.Country,{Country:it.Country,items:[],flagsCombined:{},termsSet:new Set()});
    const g=map.get(it.Country);
    g.items.push(it);
    if(it.TermsUsed) g.termsSet.add(it.TermsUsed);
    TAG_RULES.forEach(r=>{ g.flagsCombined[r.key]=(g.flagsCombined[r.key]||it.flags[r.key]); });
  }
  DefState.data = Array.from(map.values()).map(g=>({
    Country:g.Country, items:g.items, flagsCombined:g.flagsCombined, termsJoined:Array.from(g.termsSet).join("；")
  })).sort((a,b)=>a.Country.localeCompare(b.Country));
  DefState.filtered = DefState.data.slice();
}

function buildDefControls(){
  const countries = Array.from(new Set(DefState.data.map(d=>d.Country))).sort((a,b)=>a.localeCompare(b));
  $("#def_country").innerHTML = `<option value="ALL">全部國家</option>` + countries.map(c=>`<option>${escapeHTML(c)}</option>`).join("");
  $("#def_country").addEventListener("change",e=>{DefState.selectedCountry=e.target.value;applyDefFilters();});
  $("#def_search").addEventListener("input",e=>{DefState.searchText=e.target.value.trim();applyDefFilters();});
  $("#def_tags").innerHTML = TAG_RULES.map(t=>`<button class="tag" data-key="${t.key}">${t.label}</button>`).join("");
  $("#def_tags").addEventListener("click",e=>{
    const btn=e.target.closest(".tag"); if(!btn) return;
    const k=btn.dataset.key; btn.classList.toggle("active");
    if(btn.classList.contains("active")) DefState.selectedTags.add(k); else DefState.selectedTags.delete(k);
    applyDefFilters();
  });
}

function applyDefFilters(){
  const q=DefState.searchText.toLowerCase();
  DefState.filtered = DefState.data.filter(d=>{
    if(DefState.selectedCountry!=="ALL"&&d.Country!==DefState.selectedCountry) return false;
    for(const key of DefState.selectedTags) if(!d.flagsCombined[key]) return false;
    if(q){
      const hay=[d.Country,d.termsJoined,...d.items.map(i=>i.Definition)].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  renderDefCards();
}

function renderDefCards(){
  const wrap=$("#def_cards"), empty=$("#def_empty");
  if(!DefState.filtered.length){wrap.innerHTML="";empty.style.display="block";return;}
  empty.style.display="none";

  wrap.innerHTML = DefState.filtered.map((d)=>{
    const chips = TAG_RULES.filter(t=>d.flagsCombined[t.key]).slice(0,3).map(t=>`<span class="chip">${t.label}</span>`).join("");
    const multiple = d.items.length>1;
    const variants = d.items.map((it,i)=>`
      <div class="variant">
        <div class="variant-header"><span class="vindex">#${i+1}</span>${escapeHTML(it.TermsUsed || "—")}</div>
        <div class="variant-body">${escapeHTML(it.Definition)}</div>
      </div>`).join("");

    return `
      <article class="card ${multiple?"multiple":""}" data-country="${escapeHTML(d.Country)}">
        <div class="card-header">
          <div>
            <div class="country">${escapeHTML(d.Country)}</div>
            <div class="terms">${escapeHTML(d.termsJoined || (d.items[0]?.TermsUsed || "—"))}</div>
          </div>
        </div>

        <div class="summary">${escapeHTML(d.items[0]?.short || "")}</div>

        <!-- 按一下才生成 AI 摘要 -->
        <div class="actions" style="margin-top:10px;gap:6px;flex-wrap:wrap">
          <button class="btn" data-ai-btn data-country="${escapeHTML(d.Country)}">⚡ 產生 AI 摘要</button>
          <button class="btn toggle">展開全文</button>
          ${multiple?`<span class="badge">共 ${d.items.length} 個定義</span>`:""}
          <div class="chips">${chips}</div>
        </div>

        <!-- 生成結果會塞在這裡（預設隱藏） -->
        <div class="ai-snippet" data-result-for="${escapeHTML(d.Country)}" style="display:none"></div>

        <div class="fulltext" style="display:none;">${variants}</div>

        <div class="actions" style="margin-top:8px">
          <a class="btn" href="#/eligibility">→ 申請資格</a>
          <a class="btn" href="#/reassessment?country=${countryParam(d.Country)}">→ 再審查頻率</a>
          <a class="btn" href="#/priority?country=${countryParam(d.Country)}">→ 優先分配</a>
          <a class="btn" href="#/characteristics?country=${countryParam(d.Country)}">→ 社宅特徵</a>
        </div>
      </article>`;
  }).join("");

  // 展開全文切換
  wrap.onclick = (e)=>{
    const btn = e.target.closest(".toggle");
    if(btn){
      const card = e.target.closest(".card");
      const full = $(".fulltext",card);
      const open = full.style.display!=="none";
      full.style.display = open ? "none":"block";
      btn.textContent = open ? "展開全文" : "收合全文";
    }
  };

  // 綁定「產生 AI 摘要」按鈕（按一下才打 API）
  attachDefinitionAISnippetHandlers(wrap);
}

/* === 定義頁：AI 國家摘要（按一下才生成） ===================== */
function attachDefinitionAISnippetHandlers(scope){
  scope.querySelectorAll('[data-ai-btn]').forEach((btn)=>{
    btn.addEventListener('click', async ()=>{
      const country = btn.getAttribute('data-country');
      const card = btn.closest('.card');
      const resultBox = card.querySelector(`[data-result-for="${CSS.escape(country)}"]`);

      // 找該國定義資料
      const record = DefState.data.find(d => d.Country === country);
      const defs = (record?.items || []).map(x => ({
        TermsUsed: x.TermsUsed,
        Definition: x.Definition
      }));

      // UI 狀態：loading
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "產生中…";
      resultBox.style.display = "block";
      resultBox.innerHTML = `<em>AI 摘要生成中，可能需要數秒…</em>`;

      try{
        const html = await summarizeCountryDefinition(country, defs);
        resultBox.innerHTML = html || `<span class="ai-error">未取得有效內容。</span>`;
      }catch(err){
        resultBox.innerHTML = `<span class="ai-error">AI 摘要失敗，已改用規則摘要。<br>${escapeHTML(localCountryDefinitionFallback(country, defs))}</span>`;
      }finally{
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

async function summarizeCountryDefinition(country, defs){
  if(!ENABLE_AI || !AI_API_BASE) return localCountryDefinitionFallback(country, defs);

  const payload = {
    topic: "definitions",
    mode: "country",
    language: "zh-TW",
    country,
    context: { definitions: defs }
  };

  const json = await apiFetch("/api/report", payload);
  if(json?.ok && json?.html) return json.html;
  return localCountryDefinitionFallback(country, defs);
}

function localCountryDefinitionFallback(country, defs){
  if(!defs || !defs.length) return `${country}：尚無定義資料。`;
  const joined = defs.map((d,i)=>`#${i+1}【稱呼】${d.TermsUsed || "—"}；【定義】${shortText(d.Definition, 280)}`).join(" / ");
  return `<strong>${escapeHTML(country)}</strong> 的社宅定義摘要：${escapeHTML(joined)}`;
}

/* =================== 申請資格 =================== */
const EliState = { raw:[], view:"matrix", search:"" };

async function renderEligibility(root){
  const sec=document.createElement("section"); sec.id="eligibility";
  sec.innerHTML = `
    <div class="controls fade-in">
      <div class="searchbox"><input id="eli_search" type="text" placeholder="搜尋國家或備註…" /></div>
      <div class="selectbox">
        <select id="eli_sort">
          <option value="az">排序：國名 A→Z</option>
          <option value="score">排序：限制條件數（多→少）</option>
        </select>
      </div>
      <div class="modebox">
        <select id="eli_mode">
          <option value="matrix">顯示：矩陣</option>
          <option value="cards">顯示：卡片</option>
        </select>
      </div>
      <div class="tags" id="eli_quick">
        <button class="tag" data-q="AllEligible:Yes">開放所有人</button>
        <button class="tag" data-q="IncomeThreshold:Yes">有收入門檻</button>
        <button class="tag" data-q="CitizenshipOrPR:Yes">需公民/PR</button>
        <button class="tag" data-q="LocalResidency:Yes">需在地居住</button>
        <button class="tag" data-q="Employment:Yes">需就業</button>
        <a class="btn" href="#/definitions">← 社宅定義</a>
        <a class="btn" href="#/reassessment">→ 再審查頻率</a>
        <a class="btn" href="#/priority">→ 優先分配</a>
        <a class="btn" href="#/characteristics">→ 社宅特徵</a>
      </div>
    </div>
    <div id="eli_mount" class="fade-in"></div>
    <div id="eli_empty" class="empty" style="display:none;">沒有符合條件的國家</div>
  `;
  root.appendChild(sec);

  await loadEligibility();
  bindEligibilityControls();
  renderEligibilityView();
}

async function loadEligibility(){
  let text=""; 
  try{
    const resp = await fetch(CSV_ELIGIBILITY,{cache:"no-store"}); if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
  }catch(err){ console.error("Fetch CSV_ELIGIBILITY failed:", err); EliState.raw=[]; return; }

  const rows = csvParse(text); if(!rows.length){ EliState.raw=[]; return; }
  const h = rows[0];

  const col = {
    Country: idxByAliases(h, ["country"]),
    CountryNormalized: idxByAliases(h, ["countrynormalized","countryclean","countrynorm"]),
    All: idxByAliases(h, ["alleligible","allareeligible","all"]),
    Inc: idxByAliases(h, ["incomethreshold","income"]),
    PR:  idxByAliases(h, ["citizenshiporpr","citizenshippermresidency","citizenship","permresidency"]),
    Res: idxByAliases(h, ["localresidency","residency","local"]),
    Emp: idxByAliases(h, ["employment"]),
    Note:idxByAliases(h, ["othernotes","notes","note"])
  };

  EliState.raw = rows.slice(1).map(r=>{
    const get=(i,def="")=>(i>=0&&r[i]!=null)?String(r[i]).trim():def;
    const c  = get(col.Country);
    if(!c) return null;
    return {
      c,
      cn: get(col.CountryNormalized) || c,
      All: get(col.All,"NA"),
      Inc: get(col.Inc,"NA"),
      PR:  get(col.PR,"NA"),
      Res: get(col.Res,"NA"),
      Emp: get(col.Emp,"NA"),
      Note:get(col.Note,"")
    };
  }).filter(Boolean);
}

function bindEligibilityControls(){
  $("#eli_search").addEventListener("input",e=>{EliState.search=e.target.value.trim().toLowerCase(); renderEligibilityView();});
  $("#eli_sort").addEventListener("change",renderEligibilityView);
  $("#eli_mode").addEventListener("change",e=>{EliState.view=e.target.value; renderEligibilityView();});
  $("#eli_quick").addEventListener("click",(e)=>{
    const t=e.target.closest(".tag"); if(!t) return;
    const [k,v]=t.dataset.q.split(":"); const sel=$("#eli_search"); sel.value=""; EliState.search=""; EliState.quick={key:k,val:v}; renderEligibilityView();
  });
}

function filterEligibility(data){
  const q = EliState.search; const quick = EliState.quick;
  return data.filter(d=>{
    if(q){
      const hay=[d.c,d.cn,d.All,d.Inc,d.PR,d.Res,d.Emp,d.Note].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(quick){
      const mapKey={AllEligible:"All",IncomeThreshold:"Inc",CitizenshipOrPR:"PR",LocalResidency:"Res",Employment:"Emp"};
      const val=d[mapKey[quick.key]||quick.key];
      if(!val||val.toUpperCase()!==quick.val.toUpperCase()) return false;
    }
    return true;
  });
}

function sortEligibility(arr){
  const how=$("#eli_sort").value;
  if(how==="score"){
    const score=d=>["Inc","PR","Res","Emp"].reduce((s,k)=>s+(String(d[k]).toUpperCase()==="YES"?1:0),0);
    arr.sort((a,b)=>score(b)-score(a)||a.cn.localeCompare(b.cn));
  }else arr.sort((a,b)=>a.cn.localeCompare(b.cn));
}

function renderEligibilityView(){
  const mount=$("#eli_mount"), empty=$("#eli_empty");
  let data = filterEligibility(EliState.raw.slice()); sortEligibility(data);
  if(!data.length){ mount.innerHTML=""; empty.style.display="block"; empty.textContent="沒有符合條件的國家（可能是 CSV 欄位名稱不一致或檔案路徑有誤）"; return; }
  empty.style.display="none";

  if(EliState.view==="matrix") mount.innerHTML = `
    <div class="matrix">
      <table class="table">
        <thead><tr>
          <th>Country</th><th>All</th><th>Income</th><th>Citizenship/PR</th><th>Residency</th><th>Employment</th><th>Notes</th>
        </tr></thead>
        <tbody>
          ${data.map(d=>`
            <tr>
              <td class="flag"><strong>${escapeHTML(d.c)}</strong></td>
              <td>${pill(d.All)}</td><td>${pill(d.Inc)}</td><td>${pill(d.PR)}</td><td>${pill(d.Res)}</td><td>${pill(d.Emp)}</td>
              <td class="note">${escapeHTML(d.Note||"")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="actions" style="margin:10px 0">
      <a class="btn" href="#/definitions">← 社宅定義</a>
      <a class="btn" href="#/reassessment">→ 再審查頻率</a>
      <a class="btn" href="#/priority">→ 優先分配</a>
      <a class="btn" href="#/characteristics">→ 社宅特徵</a>
    </div>`;
  else mount.innerHTML = `
    <div class="cards">
      ${data.map(d=>`
        <article class="card">
          <div class="card-header"><div class="country">${escapeHTML(d.c)}</div></div>
          <div class="summary">
            <span class="chip">All: ${pill(d.All)}</span>
            <span class="chip">Income: ${pill(d.Inc)}</span>
            <span class="chip">Cit/PR: ${pill(d.PR)}</span>
            <span class="chip">Residency: ${pill(d.Res)}</span>
            <span class="chip">Employment: ${pill(d.Emp)}</span>
          </div>
          <div class="fulltext" style="margin-top:10px">${escapeHTML(d.Note||"")||"<span class='note'>—</span>"}</div>
          <div class="actions" style="margin-top:10px">
            <a class="btn" href="#/definitions">查看定義</a>
            <a class="btn" href="#/reassessment?country=${countryParam(d.cn)}">再審查頻率</a>
            <a class="btn" href="#/priority?country=${countryParam(d.cn)}">優先分配</a>
            <a class="btn" href="#/characteristics?country=${countryParam(d.cn)}">社宅特徵</a>
          </div>
        </article>`).join("")}
    </div>`;
}

/* =================== 再審查頻率 =================== */
const ReaState = { raw:[], search:"", sort:"az", preselectCountry:null };

async function renderReassessment(root, params={}){
  ReaState.preselectCountry = params.country || null;
  const sec=document.createElement("section"); sec.id="reassessment";
  sec.innerHTML = `
    <div class="home-hero" style="margin-top:20px;">
      <h2>資格重新審查頻率（Re-assessment）</h2>
      <p class="note">若國家內分不同制度（如波蘭），會以「Segment」標示。</p>
    </div>
    <div class="controls fade-in">
      <div class="searchbox"><input id="rea_search" type="text" placeholder="搜尋國家、頻率或敘述…" /></div>
      <div class="selectbox">
        <select id="rea_sort"><option value="az">排序：國名 A→Z</option><option value="freq">排序：頻率類型</option></select>
      </div>
      <div class="modebox">
        <a class="btn" href="#/eligibility">← 申請資格</a>
        <a class="btn" href="#/priority">→ 優先分配</a>
        <a class="btn" href="#/characteristics">→ 社宅特徵</a>
        <a class="btn" href="#/definitions">→ 社宅定義</a>
      </div>
    </div>
    <div id="rea_mount" class="fade-in"></div>
    <div id="rea_empty" class="empty" style="display:none;">沒有符合條件的國家</div>`;
  root.appendChild(sec);

  await loadReassessment();
  bindReassessmentControls();
  renderReassessmentTable();
}

async function loadReassessment(){
  let text="";
  try{
    const resp = await fetch(CSV_REASSESSMENT,{cache:"no-store"}); if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
  }catch(err){ console.error("Fetch CSV_REASSESSMENT failed:", err); ReaState.raw=[]; return; }

  const rows = csvParse(text); if(!rows.length){ ReaState.raw=[]; return; }
  const h = rows[0];
  const col = {
    Country: idxByAliases(h, ["country"]),
    Segment: idxByAliases(h, ["segment","scheme","program"]),
    CountryNormalized: idxByAliases(h, ["countrynormalized","countryclean","countrynorm"]),
    Freq: idxByAliases(h, ["standardizedfrequency","frequency","freq","reassessmentfrequency"]),
    Detail: idxByAliases(h, ["detail","notes","othernotes","remark","remarks"])
  };
  ReaState.raw = rows.slice(1).map(r=>{
    const get=(i,def="")=>(i>=0&&r[i]!=null)?String(r[i]).trim():def;
    const c=get(col.Country); if(!c) return null;
    return { c, seg:get(col.Segment), cn:get(col.CountryNormalized)||c, freq:get(col.Freq), detail:get(col.Detail) };
  }).filter(Boolean);
  if(ReaState.preselectCountry){ ReaState.search=ReaState.preselectCountry.toLowerCase(); const input=$("#rea_search"); if(input) input.value=ReaState.preselectCountry; }
}

function bindReassessmentControls(){
  $("#rea_search").addEventListener("input",e=>{ReaState.search=e.target.value.trim().toLowerCase(); renderReassessmentTable();});
  $("#rea_sort").addEventListener("change",e=>{ReaState.sort=e.target.value; renderReassessmentTable();});
}

function filterReassessment(d){
  const q=ReaState.search; if(!q) return d;
  return d.filter(x=>[x.c,x.seg,x.cn,x.freq,x.detail].map(normSearch).join(" | ").includes(normSearch(q)));
}

function sortReassessment(arr){
  if(ReaState.sort==="freq"){
    const order=["Annually","Every 6 months","Bi-annually","Continuous review","Lease-end / ad hoc","At lease expiration (usually every 3 years)","Every 5 years","Varies (typically every 3 years)","Depends on local management","Re-assessed (timing unspecified)","Yes (unspecified)","No regular reassessment","NA"];
    const score=v=>{const i=order.indexOf(v);return i===-1?999:i;};
    arr.sort((a,b)=>score(a.freq)-score(b.freq)||a.cn.localeCompare(b.cn));
  }else arr.sort((a,b)=>a.cn.localeCompare(b.cn));
}

function renderReassessmentTable(){
  const mount=$("#rea_mount"), empty=$("#rea_empty");
  let data = filterReassessment(ReaState.raw.slice()); sortReassessment(data);
  if(!data.length){ mount.innerHTML=""; empty.style.display="block"; empty.textContent="沒有符合條件的國家（可能是 CSV 欄位名稱不一致或檔案路徑有誤）"; return; }
  empty.style.display="none";
  mount.innerHTML = `
    <div class="matrix">
      <table class="table">
        <thead><tr><th>Country</th><th>Segment</th><th>Frequency</th><th>Detail</th></tr></thead>
        <tbody>
          ${data.map(d=>`
            <tr>
              <td class="flag"><strong>${escapeHTML(d.c)}</strong></td>
              <td>${escapeHTML(d.seg||"—")}</td>
              <td>${escapeHTML(d.freq||"—")}</td>
              <td class="note">${escapeHTML(d.detail||"")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="actions" style="margin:10px 0">
      <a class="btn" href="#/eligibility">← 申請資格</a>
      <a class="btn" href="#/priority">→ 優先分配</a>
      <a class="btn" href="#/characteristics">→ 社宅特徵</a>
      <a class="btn" href="#/definitions">→ 社宅定義</a>
    </div>`;
}

/* =================== 優先分配 =================== */
const PriState = { raw:[], search:"", quick:null, sort:"az", preselectCountry:null };

async function renderPriority(root, params={}){
  PriState.preselectCountry = params.country || null;

  const sec=document.createElement("section"); sec.id="priority";
  sec.innerHTML = `
    <div class="home-hero" style="margin-top:20px;">
      <h2>優先分配條件（Priority allocation）</h2>
      <p class="note">比較各國對等待名單、收入、身心障礙、長者、庇護申請者、族群、家戶組成與現住房況等優先規則。</p>
    </div>

    <div class="controls fade-in">
      <div class="searchbox"><input id="pri_search" type="text" placeholder="搜尋國家或敘述…" /></div>
      <div class="selectbox">
        <select id="pri_sort">
          <option value="az">排序：國名 A→Z</option>
          <option value="score">排序：優先項目數（多→少）</option>
        </select>
      </div>
      <div class="tags" id="pri_quick">
        <button class="tag" data-q="Disability:Yes">身心障礙</button>
        <button class="tag" data-q="Elderly:Yes">長者</button>
        <button class="tag" data-q="EthnicOrRacialMinority:Yes">族群</button>
        <button class="tag" data-q="CurrentHousingConditions:Yes">現住房況</button>
        <a class="btn" href="#/eligibility">← 申請資格</a>
        <a class="btn" href="#/reassessment">→ 再審查頻率</a>
        <a class="btn" href="#/definitions">→ 社宅定義</a>
        <a class="btn" href="#/characteristics">→ 社宅特徵</a>
      </div>
    </div>

    <div id="pri_mount" class="fade-in"></div>
    <div id="pri_empty" class="empty" style="display:none;">沒有符合條件的國家</div>
  `;
  root.appendChild(sec);

  await loadPriority();
  bindPriorityControls();
  renderPriorityTable();
}

async function loadPriority(){
  let text="";
  try{
    const resp = await fetch(CSV_PRIORITY,{cache:"no-store"}); if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
  }catch(err){ console.error("Fetch CSV_PRIORITY failed:", err); PriState.raw=[]; return; }

  const rows = csvParse(text); if(!rows.length){ PriState.raw=[]; return; }
  const h = rows[0];
  const col = {
    Country: idxByAliases(h, ["country"]),
    CountryNormalized: idxByAliases(h, ["countrynormalized","countryclean","countrynorm"]),
    Wait: idxByAliases(h, ["timeonwaitinglist","waitinglist","wait"]),
    Income: idxByAliases(h, ["incomelevel","income"]),
    Dis: idxByAliases(h, ["disability","disabled"]),
    Eld: idxByAliases(h, ["elderly","older","senior"]),
    Asy: idxByAliases(h, ["asylumseekers","asylum"]),
    Eth: idxByAliases(h, ["ethnicorracialminority","ethnicminority","racialminority","minority"]),
    HH: idxByAliases(h, ["householdcompositionorsize","householdsize","householdcomposition"]),
    Cond: idxByAliases(h, ["currenthousingconditions","housingconditions","currenthousing"]),
    Note: idxByAliases(h, ["othernotes","notes","note"])
  };

  PriState.raw = rows.slice(1).map(r=>{
    const get=(i,def="")=>(i>=0&&r[i]!=null)?String(r[i]).trim():def;
    const c=get(col.Country); if(!c) return null;
    return {
      c,
      cn:get(col.CountryNormalized)||c,
      Wait:get(col.Wait,"NA"),
      Income:get(col.Income,"NA"),
      Dis:get(col.Dis,"NA"),
      Eld:get(col.Eld,"NA"),
      Asy:get(col.Asy,"NA"),
      Eth:get(col.Eth,"NA"),
      HH:get(col.HH,"NA"),
      Cond:get(col.Cond,"NA"),
      Note:get(col.Note,"")
    };
  }).filter(Boolean);
  if(PriState.preselectCountry){ PriState.search=PriState.preselectCountry.toLowerCase(); const input=$("#pri_search"); if(input) input.value=PriState.preselectCountry; }
}

function bindPriorityControls(){
  $("#pri_search").addEventListener("input",e=>{PriState.search=e.target.value.trim().toLowerCase(); renderPriorityTable();});
  $("#pri_sort").addEventListener("change",e=>{PriState.sort=e.target.value; renderPriorityTable();});
  $("#pri_quick").addEventListener("click",(e)=>{
    const t=e.target.closest(".tag"); if(!t) return;
    const [k,v]=t.dataset.q.split(":"); PriState.quick={key:k,val:v}; $("#pri_search").value=""; PriState.search=""; renderPriorityTable();
  });
}

function filterPriority(data){
  const q=PriState.search, quick=PriState.quick;
  return data.filter(d=>{
    if(q){
      const hay=[d.c,d.cn,d.Wait,d.Income,d.Dis,d.Eld,d.Asy,d.Eth,d.HH,d.Cond,d.Note].map(normSearch).join(" | ");
      if(!hay.includes(normSearch(q))) return false;
    }
    if(quick){
      const mapKey = {Disability:"Dis",Elderly:"Eld",EthnicOrRacialMinority:"Eth",CurrentHousingConditions:"Cond"};
      const val = d[mapKey[quick.key]||quick.key];
      if(!val || val.toUpperCase()!==quick.val.toUpperCase()) return false;
    }
    return true;
  });
}

function sortPriority(arr){
  if(PriState.sort==="score"){
    const score=d=>["Wait","Income","Dis","Eld","Asy","Eth","HH","Cond"].reduce((s,k)=>s+(String(d[k]).toUpperCase()==="YES"?1:0),0);
    arr.sort((a,b)=>score(b)-score(a)||a.cn.localeCompare(b.cn));
  }else arr.sort((a,b)=>a.cn.localeCompare(b.cn));
}

function renderPriorityTable(){
  const mount=$("#pri_mount"), empty=$("#pri_empty");
  let data = filterPriority(PriState.raw.slice()); sortPriority(data);
  if(!data.length){ mount.innerHTML=""; empty.style.display="block"; empty.textContent="沒有符合條件的國家（可能是 CSV 欄位名稱不一致或檔案路徑有誤）"; return; }
  empty.style.display="none";

  mount.innerHTML = `
    <div class="matrix">
      <table class="table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Waiting list</th>
            <th>Income</th>
            <th>Disability</th>
            <th>Elderly</th>
            <th>Asylum seekers</th>
            <th>Ethnic minority</th>
            <th>Household size</th>
            <th>Current housing</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(d=>`
            <tr>
              <td class="flag"><strong>${escapeHTML(d.c)}</strong></td>
              <td>${pill(d.Wait)}</td>
              <td>${pill(d.Income)}</td>
              <td>${pill(d.Dis)}</td>
              <td>${pill(d.Eld)}</td>
              <td>${pill(d.Asy)}</td>
              <td>${pill(d.Eth)}</td>
              <td>${pill(d.HH)}</td>
              <td>${pill(d.Cond)}</td>
              <td class="note">${escapeHTML(d.Note||"")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="actions" style="margin:10px 0">
      <a class="btn" href="#/eligibility">← 申請資格</a>
      <a class="btn" href="#/reassessment">→ 再審查頻率</a>
      <a class="btn" href="#/definitions">→ 社宅定義</a>
      <a class="btn" href="#/characteristics">→ 社宅特徵</a>
    </div>
  `;
}

/* =================== 社宅特徵 =================== */
const ChaState = { raw:[], search:"", sort:"az", preselectCountry:null };

async function renderCharacteristics(root, params={}){
  ChaState.preselectCountry = params.country || null;

  const sec=document.createElement("section"); sec.id="characteristics";
  sec.innerHTML = `
    <div class="home-hero" style="margin-top:20px;">
      <h2>社宅特徵（Characteristics of social rental housing）</h2>
      <p class="note">定價方式（市場/成本/所得/效用）、租金調整（定期/不定期）、社宅租金占市場租金％、承租戶購屋權（含註記）。</p>
    </div>

    <div class="controls fade-in">
      <div class="searchbox"><input id="cha_search" type="text" placeholder="搜尋國家、關鍵字…" /></div>
      <div class="selectbox">
        <select id="cha_sort">
          <option value="az">排序：國名 A→Z</option>
          <option value="score">排序：特徵旗標數（多→少）</option>
        </select>
      </div>
      <div class="modebox">
        <a class="btn" href="#/definitions">← 社宅定義</a>
        <a class="btn" href="#/eligibility">→ 申請資格</a>
        <a class="btn" href="#/priority">→ 優先分配</a>
        <a class="btn" href="#/reassessment">→ 再審查頻率</a>
      </div>
    </div>

    <div id="cha_notice" class="empty" style="display:none;"></div>
    <div id="cha_mount" class="fade-in"></div>
    <div id="cha_empty" class="empty" style="display:none;">沒有符合條件的國家</div>
  `;
  root.appendChild(sec);

  await loadCharacteristics();
  bindCharacteristicsControls();

  if(ChaState.preselectCountry){
    const ip = $("#cha_search"); if(ip) ip.value = ChaState.preselectCountry;
    ChaState.search = ChaState.preselectCountry;
  }

  renderCharacteristicsTable();
}

async function loadCharacteristics(){
  let text="";
  try{
    const resp = await fetch(CSV_CHARACTERISTICS,{cache:"no-store"}); if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
  }catch(err){ console.error("Fetch CSV_CHARACTERISTICS failed:", err); ChaState.raw=[]; return; }

  const rows = csvParse(text); if(!rows.length){ ChaState.raw=[]; return; }
  const h = rows[0];

  const col = {
    Country: idxByAliases(h, ["country"]),
    CountryNormalized: idxByAliases(h, ["countrynormalized","countryclean","countrynorm"]),
    MB: idxByAliases(h, ["rentsettingmarketbased","marketbased"]),
    CB: idxByAliases(h, ["rentsettingcostbased","costbased"]),
    IB: idxByAliases(h, ["rentsettingincomebased","incomebased"]),
    UB: idxByAliases(h, ["rentsettingutilitybased","utilitybased"]),
    IncReg: idxByAliases(h, ["rentincreaseregular","rentincreasereg"]),
    IncNot: idxByAliases(h, ["rentincreasenotregular","rentincreasenonregular","notregular"]),
    Pct: idxByAliases(h, ["socialrentpctofmarket","socialrentpercentagemarket","socialrentshareofmarket","pct"]),
    Buy: idxByAliases(h, ["sittingtenantrighttobuynorm","righttobuynorm","righttobuy"]),
    BuyNote: idxByAliases(h, ["sittingtenantrighttobuynotes","righttobuynotes","notes","othernotes"])
  };

  ChaState.raw = rows.slice(1).map(r=>{
    const get=(i,def="")=>(i>=0&&r[i]!=null)?String(r[i]).trim():def;
    const c=get(col.Country); if(!c) return null;
    return {
      c,
      cn:get(col.CountryNormalized)||c,
      MB:get(col.MB,"NA"),
      CB:get(col.CB,"NA"),
      IB:get(col.IB,"NA"),
      UB:get(col.UB,"NA"),
      IncReg:get(col.IncReg,"NA"),
      IncNot:get(col.IncNot,"NA"),
      Pct:get(col.Pct,""),
      Buy:get(col.Buy,"NA"),
      BuyNote:get(col.BuyNote,"")
    };
  }).filter(Boolean);
}

function bindCharacteristicsControls(){
  $("#cha_search").addEventListener("input",e=>{ChaState.search=e.target.value.trim(); renderCharacteristicsTable();});
  $("#cha_sort").addEventListener("change",e=>{ChaState.sort=e.target.value; renderCharacteristicsTable();});
}

function filterCharacteristics(data){
  const qRaw = ChaState.search;
  if(!qRaw) return data;
  const q = normSearch(qRaw);
  return data.filter(d=>{
    const hay = [d.c,d.cn,d.MB,d.CB,d.IB,d.UB,d.IncReg,d.IncNot,d.Pct,d.Buy,d.BuyNote].map(normSearch).join(" | ");
    return hay.includes(q);
  });
}

function sortCharacteristics(arr){
  if(ChaState.sort==="score"){
    const score=d=>["MB","CB","IB","UB","IncReg","IncNot"].reduce((s,k)=>s+(String(d[k]).toUpperCase()==="YES"?1:0),0);
    arr.sort((a,b)=>score(b)-score(a)||a.cn.localeCompare(b.cn));
  }else arr.sort((a,b)=>a.cn.localeCompare(b.cn));
}

function renderCharacteristicsTable(){
  const mount=$("#cha_mount"), empty=$("#cha_empty"), notice=$("#cha_notice");
  let data = filterCharacteristics(ChaState.raw.slice());
  sortCharacteristics(data);

  if((!data.length) && ChaState.search){
    const total = ChaState.raw.length;
    notice.style.display="block";
    notice.textContent = `找不到完全符合「${ChaState.search}」的結果，已顯示全部（共 ${total} 筆）。`;
    data = ChaState.raw.slice();
    sortCharacteristics(data);
  }else{
    notice.style.display="none";
    notice.textContent="";
  }

  if(!data.length){
    mount.innerHTML="";
    empty.style.display="block";
    empty.textContent="沒有符合條件的國家（可能是 CSV 欄位名稱不一致或檔案路徑有誤）";
    return;
  }
  empty.style.display="none";

  mount.innerHTML = `
    <div class="matrix">
      <table class="table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Market-based</th>
            <th>Cost-based</th>
            <th>Income-based</th>
            <th>Utility-based</th>
            <th>Rent ↑ regular</th>
            <th>Rent ↑ not regular</th>
            <th>Social rent % of market</th>
            <th>Sitting tenant right to buy</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(d=>`
            <tr>
              <td class="flag"><strong>${escapeHTML(d.c)}</strong></td>
              <td>${pill(d.MB)}</td>
              <td>${pill(d.CB)}</td>
              <td>${pill(d.IB)}</td>
              <td>${pill(d.UB)}</td>
              <td>${pill(d.IncReg)}</td>
              <td>${pill(d.IncNot)}</td>
              <td>${escapeHTML(d.Pct||"")}</td>
              <td>${escapeHTML(d.Buy||"")}</td>
              <td class="note">${escapeHTML(d.BuyNote||"")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="actions" style="margin:10px 0">
      <a class="btn" href="#/definitions">← 社宅定義</a>
      <a class="btn" href="#/eligibility">→ 申請資格</a>
      <a class="btn" href="#/priority">→ 優先分配</a>
      <a class="btn" href="#/reassessment">→ 再審查頻率</a>
    </div>
  `;
}

/* =================== 共用：YES/NO/NA 標籤 =================== */
function pill(v){
  const x = String(v||"NA").trim().toUpperCase();
  if(x==="YES") return `<span class="pill y">YES</span>`;
  if(x==="NO")  return `<span class="pill n">NO</span>`;
  return `<span class="pill na">NA</span>`;
}

/* ============================================================
   AI 對話頁（#/ai）— 先「快速提問」→「輸入框」→「聊天紀錄」
   ============================================================ */
async function renderAiPage(container) {
  const COUNTRIES = ["台灣","日本","韓國","德國","法國","荷蘭","英國","瑞典","加拿大","澳洲","紐西蘭","美國","義大利","西班牙","挪威","丹麥","芬蘭"];

  const EXAMPLES = [
    `請幫我總結 ${COUNTRIES[5]} 的社宅定義與重點制度。`,
    `${COUNTRIES[1]} 與 ${COUNTRIES[3]} 在「優先分配」是否都有針對長者？`,
    `哪個國家在「社宅租金占市場租金％」的數值較低？請列出前 3 名與理由。`,
    `${COUNTRIES[0]} 和 ${COUNTRIES[2]} 的申請資格差異為何？請用表格列點。`,
  ];

  container.innerHTML = `
    <section class="ai-page">
      <div class="ai-hero">
        <h2>🤖 AI 對話</h2>
        <p class="muted">這裡可以詢問關於本資料庫的開放式問題：機制比較、各國摘要與差異等。由AI機器人替您摘錄數據庫重點回覆。</p>
      </div>

      <div class="ai-chat" id="aiChat">
        <!-- 1) 快速提問 -->
        <div class="ai-hint">
          <div class="hint-title">快速提問（點一下即可帶入輸入框）</div>
          <div class="ai-suggest" id="aiSuggest"></div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
            <button id="aiHealthBtn" class="btn">測試連線</button>
            <span id="aiHealthMsg" class="note"></span>
          </div>
        </div>

        <!-- 2) 輸入框（送出後才會顯示下方聊天紀錄） -->
        <form id="chatForm" class="chat-form">
          <textarea id="chatInput" placeholder="輸入你的問題，例如：\n- ${EXAMPLES[0]}\n- ${EXAMPLES[1]}"></textarea>
          <button type="submit" class="btn primary">送出</button>
        </form>

        <!-- 3) 聊天紀錄（空的時候會被 CSS 隱藏） -->
        <div class="chat-log" id="chatLog" aria-live="polite"></div>
      </div>
    </section>
  `;

  // 渲染可點示例
  const suggest = container.querySelector('#aiSuggest');
  suggest.innerHTML = EXAMPLES.map(q => `<span class="suggest-pill" data-q="${escapeHTML(q)}">${escapeHTML(q)}</span>`).join("");
  suggest.addEventListener('click', (e) => {
    const pill = e.target.closest('.suggest-pill');
    if (!pill) return;
    const q = pill.getAttribute('data-q');
    const ta = container.querySelector('#chatInput');
    ta.value = q;
    ta.focus();
  });

  // 健康檢查
  const healthBtn = container.querySelector('#aiHealthBtn');
  const healthMsg = container.querySelector('#aiHealthMsg');
  healthBtn.addEventListener('click', async () => {
    healthBtn.disabled = true;
    healthMsg.textContent = "檢查中…";
    try {
      const msg = await healthCheckAI();
      healthMsg.textContent = msg;
    } catch (e) {
      healthMsg.textContent = `錯誤：${e.message}`;
    } finally {
      healthBtn.disabled = false;
    }
  });

  const chatLog = container.querySelector('#chatLog');
  const form = container.querySelector('#chatForm');
  const input = container.querySelector('#chatInput');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;

    appendChatBubble(chatLog, 'user', q);
    input.value = '';
    input.disabled = true;

    try {
      const answer = await aiQuery(q, {
        sources: {
          definitions: CSV_DEFINITIONS,
          eligibility: CSV_ELIGIBILITY,
          reassessment: CSV_REASSESSMENT,
          priority: CSV_PRIORITY,
          characteristics: CSV_CHARACTERISTICS,
        }
      });
      appendChatBubble(chatLog, 'assistant', answer || '（沒有取得回覆，請稍後再試）');
    } catch (err) {
      const hint = [
        "可能原因：",
        "1) Cloudflare Worker CORS 未開（需回傳 Access-Control-Allow-Origin: *、Allow-Headers: Content-Type、Allow-Methods: POST, GET）。",
        "2) API 路徑或 payload 不符（/api/chat 或 /api/report）。",
        "3) Worker 錯誤或逾時。"
      ].join("\n");
      appendChatBubble(chatLog, 'assistant', `抱歉，回覆失敗。\n${err.message}\n\n${hint}`);
      console.error("[AI Chat Error]", err);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}

function appendChatBubble(root, role, text) {
  const item = document.createElement('div');
  item.className = `bubble ${role}`;
  item.innerText = text;
  root.appendChild(item);
  root.scrollTop = root.scrollHeight;
}

/* ------------------- 更可靠的 fetch 包裝 + 健檢 ------------------- */
async function apiFetch(path, payload, {timeoutMs = 20000} = {}) {
  const url = `${AI_API_BASE.replace(/\/$/, "")}${path}`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify(payload || {}),
      signal: controller.signal
    });

    const text = await res.text(); // 先拿原文，方便除錯
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) {}

    if (!res.ok) {
      const detail = json?.error || json?.message || text || `HTTP ${res.status}`;
      throw new Error(`HTTP ${res.status} ${res.statusText} - ${detail}`);
    }
    if (!json) throw new Error("空的回應（非 JSON）");

    return json;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("連線逾時（timeout）");
    throw err;
  } finally {
    clearTimeout(to);
  }
}

async function aiQuery(question, context) {
  if (!ENABLE_AI || !AI_API_BASE) {
    return mockAnswer(question);
  }

  // 先試 /api/chat
  try {
    const json = await apiFetch("/api/chat", { question, context, language: "zh-TW" });
    if (json?.ok && (json.answer || json.html)) {
      return (json.answer || stripHtml(json.html));
    }
  } catch (e1) {
    // 再試 /api/report
    try {
      const json2 = await apiFetch("/api/report", { topic:"chat", mode:"free", question, language:"zh-TW", context });
      if (json2?.ok && (json2.answer || json2.html)) {
        return (json2.answer || stripHtml(json2.html));
      }
      throw new Error(json2?.error || "AI 沒有回傳有效內容");
    } catch (e2) {
      throw new Error(`主要端點失敗：${e1.message}\n後備端點失敗：${e2.message}`);
    }
  }

  return "（AI 沒有回傳有效內容）";
}

async function healthCheckAI() {
  try {
    const res = await fetch(`${AI_API_BASE.replace(/\/$/, "")}/api/health`, { method: "GET", mode: "cors" });
    const text = await res.text();
    return res.ok ? `OK：${text || "healthy"}` : `HTTP ${res.status} ${res.statusText}：${text}`;
  } catch (err) {
    return `無法連線：${err.message}`;
  }
}

function stripHtml(html){
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.innerText.trim();
}

function mockAnswer(q){
  const lq = q.toLowerCase();
  if(lq.includes("哪個國家") && lq.includes("比較好")) return "示例：若以「可近性 + 租金負擔」綜合評估，A 國與 B 國表現相對較佳（開發中，待真實資料接上）。";
  if(lq.includes("是否都有")) return "示例：A 國與 B 國在「租金補貼」皆有設計，但細節門檻不同（開發中）。";
  if(lq.includes("總結") || lq.includes("摘要")) return "示例：C 國社宅聚焦於弱勢戶優先、租金管制與再審查，每 X 年檢核一次（開發中）。";
  return "我可以幫你比較項目、檢查是否存在，或總結特定國家；請再換個說法試試！";
}
