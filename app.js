/* =========================================================================
   國際住宅數據庫 — 路由 + 四主題互連
   - #/definitions   社宅定義
   - #/eligibility   申請資格
   - #/reassessment  再審查頻率
   - #/priority      優先分配條件（本次新增）
   ======================================================================= */

/** 資料路徑（若你調整 GitHub 路徑，改這裡即可） */
const CSV_DEFINITIONS  = "https://raw.githubusercontent.com/PN0929/globalhousingdata/3c9bdf0d7ad4bd2cc65b670a45ddc99ffc0d3de9/data/social_housing_definitions_clean_utf8.csv";
const CSV_ELIGIBILITY  = "https://raw.githubusercontent.com/PN0929/globalhousingdata/main/data/social_rental_housing_eligibility_clean_utf8.csv";
const CSV_REASSESSMENT = "https://raw.githubusercontent.com/PN0929/globalhousingdata/main/data/social_rental_housing_reassessment_clean_utf8.csv";
const CSV_PRIORITY     = "https://raw.githubusercontent.com/PN0929/globalhousingdata/main/data/social_rental_priority_allocation_clean_utf8.csv";

/** 首頁主題卡 */
const TOPICS = [
  { slug: "definitions",  emoji: "🏘️", title: "各國社宅定義",   desc: "各國對 social housing 的稱呼與定義，比較差異", available: true,  cta: "開始探索" },
  { slug: "eligibility",  emoji: "🧾", title: "社宅申請資格",   desc: "誰能申請？收入門檻、公民/PR、在地居住等一覽",   available: true,  cta: "查看矩陣" },
  { slug: "reassessment", emoji: "🔄", title: "再審查頻率",     desc: "租戶多久需要重新審查？各國規定與備註",         available: true,  cta: "查看頻率" },
  { slug: "priority",     emoji: "🎯", title: "優先分配條件",   desc: "等待名單、身心障礙、長者等優先規則一覽",       available: true,  cta: "查看條件" }
];

/* ============ 小工具 ============ */
const $  = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));
function escapeHTML(s){ return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
function shortText(s,n=180){ if(!s)return""; const c=s.replace(/\s+/g," ").trim(); if(c.length<=n)return c; const cut=c.slice(0,n); const d=Math.max(cut.lastIndexOf("."),cut.lastIndexOf("。")); return (d>60?cut.slice(0,d+1):cut+"…"); }
function csvParse(text){
  const rows=[]; let cur=[],cell="",inQ=false;
  for(let i=0;i<text.length;i++){ const c=text[i],n=text[i+1];
    if(inQ){ if(c==='"'&&n==='"'){cell+='"';i++;} else if(c==='"'){inQ=false;} else {cell+=c;} }
    else{ if(c==='"'){inQ=true;} else if(c===','){cur.push(cell);cell="";} else if(c==='\n'){cur.push(cell);rows.push(cur);cur=[];cell="";} else if(c!=='\r'){cell+=c;} }
  }
  if(cell||cur.length){cur.push(cell);rows.push(cur);}
  return rows;
}
function getQueryParams(hash){
  const qIndex = hash.indexOf("?"); const out = {};
  if(qIndex === -1) return out;
  const q = hash.slice(qIndex+1);
  q.split("&").forEach(kv=>{
    const [k,v] = kv.split("="); out[decodeURIComponent(k||"")] = decodeURIComponent((v||"").replace(/\+/g," "));
  });
  return out;
}

/* ============ 路由 ============ */
window.addEventListener("DOMContentLoaded", () => { renderRoute(); window.addEventListener("hashchange", renderRoute); });
function setActive(route){
  $$(".topnav .nav-link").forEach(a=>a.classList.remove("active"));
  const m = route.replace(/^#\//,"").split("?")[0] || "";
  const el = $(`.topnav .nav-link[data-route="${m||'home'}"]`); if(el) el.classList.add("active");
}
function renderRoute(){
  const hash = (location.hash || "#/").replace(/^#/, "");
  const main = $(".main-content"); main.innerHTML = "";
  setActive(hash);

  if(hash.startsWith("/definitions")) renderDefinitions(main);
  else if(hash.startsWith("/eligibility")) renderEligibility(main);
  else if(hash.startsWith("/reassessment")) renderReassessment(main, getQueryParams(hash));
  else if(hash.startsWith("/priority")) renderPriority(main, getQueryParams(hash));
  else renderHome(main);
}

/* ============ 首頁 ============ */
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

/* =========================================================================
   社宅定義（與前版相同）
   ======================================================================= */
const TAG_RULES = [
  { key:"HasPublicProvider",    label:"公部門提供",     regex:/(public|municipal|state[-\s]?owned|government|local authority|authorities)/i },
  { key:"HasNonProfitProvider", label:"非營利/合作社",   regex:/(non[-\s]?profit|co-?operative|cooperative)/i },
  { key:"HasBelowMarketRent",   label:"低於市價/租控",    regex:/(below market|rent cap|capped rent|regulated rent|moderate rent)/i },
  { key:"HasIncomeTargeting",   label:"收入審查/目標族群", regex:/(income limit|low[-\s]?income|vulnerable|eligible|means[-\s]?test)/i },
  { key:"HasSubsidyOrLoans",    label:"補貼/貸款/稅優惠",  regex:/(subsid(y|ies)|grant(s)?|loan(s)?|tax|preferential rate)/i },
  { key:"LegalDefined",         label:"法律定義",         regex:/(law|act|defined in law|regulation|legal)/i },
];
const DefState = { data:[], filtered:[], selectedTags:new Set(), selectedCountry:"ALL", searchText:"", compareSet:new Set() };

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
      </div>
    </div>
    <div id="def_cards" class="cards fade-in"></div>
    <div id="def_empty" class="empty" style="display:none;">找不到符合條件的結果</div>
    <aside id="def_compare" class="compare-drawer">
      <div class="compare-title">比較（最多 3 國）</div>
      <div id="def_compare_list"></div>
      <div class="compare-actions">
        <button class="btn" id="def_clear">清空</button>
        <button class="btn primary" id="def_copy">複製摘要</button>
      </div>
    </aside>
  `;
  root.appendChild(section);

  await loadDefinitions();
  buildDefControls();
  renderDefCards();
  renderDefCompare();
}

async function loadDefinitions(){
  const resp = await fetch(CSV_DEFINITIONS,{cache:"no-store"});
  const text = await resp.text();
  const rows = csvParse(text);
  const headers = rows[0].map(h=>h.trim());
  const iC = headers.findIndex(h=>/country/i.test(h));
  const iT = headers.findIndex(h=>/terms?used/i.test(h));
  const iD = headers.findIndex(h=>/definition/i.test(h));
  const raw = rows.slice(1).map(r=>{
    const Country=(r[iC]||"").trim(), TermsUsed=((iT>=0?r[iT]:"")||"").trim(), Definition=(r[iD]||"").trim();
    const flags={}; TAG_RULES.forEach(rule=>flags[rule.key]=rule.regex.test(`${TermsUsed}\n${Definition}`));
    return { Country, TermsUsed, Definition, short: shortText(Definition,200), flags };
  }).filter(d=>d.Country && d.Definition);

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
    const k=btn.dataset.key; if(DefState.selectedTags.has(k)) DefState.selectedTags.delete(k); else DefState.selectedTags.add(k);
    btn.classList.toggle("active"); applyDefFilters();
  });

  $("#def_clear").addEventListener("click",()=>{DefState.compareSet.clear();renderDefCompare();$$("#def_cards input.cmp").forEach(cb=>cb.checked=false);});
  $("#def_copy").addEventListener("click",async()=>{
    const arr=Array.from(DefState.compareSet);
    if(!arr.length) return;
    const txt = arr.map(c=>{
      const d=DefState.data.find(x=>x.Country===c);
      const bullets = deriveDefBullets(d).join("；");
      const terms = d.termsJoined || (d.items[0]?.TermsUsed||"—");
      return `國家：${d.Country}${d.items.length>1?`（${d.items.length} 個定義）`:""}\n稱呼：${terms}\n重點：${bullets}`;
    }).join("\n\n");
    try{ await navigator.clipboard.writeText(txt); alert("已複製比較摘要！"); }catch{ alert("複製失敗，請手動選取文字。"); }
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
      <article class="card ${multiple?"multiple":""}">
        <div class="card-header">
          <div>
            <div class="country">${escapeHTML(d.Country)}</div>
            <div class="terms">${escapeHTML(d.termsJoined || (d.items[0]?.TermsUsed || "—"))}</div>
          </div>
        </div>
        <div class="summary">${escapeHTML(d.items[0]?.short || "")}</div>
        <div class="actions">
          <button class="btn toggle">展開全文</button>
          ${multiple?`<span class="badge">共 ${d.items.length} 個定義</span>`:""}
          <div class="chips">${chips}</div>
        </div>
        <div class="fulltext" style="display:none;">${variants}</div>
        <div class="actions" style="margin-top:8px">
          <a class="btn" href="#/eligibility">→ 申請資格</a>
          <a class="btn" href="#/reassessment?country=${encodeURIComponent(d.Country)}">→ 再審查頻率</a>
          <a class="btn" href="#/priority?country=${encodeURIComponent(d.Country)}">→ 優先分配</a>
        </div>
      </article>`;
  }).join("");

  // 展開全文
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
}
function renderDefCompare(){} // (保留結構，簡化本段展示)
function deriveDefBullets(d){
  const f=d.flagsCombined||{}; const out=[];
  if(f.HasPublicProvider) out.push("公部門/地方政府提供或管理");
  if(f.HasNonProfitProvider) out.push("非營利/合作社參與");
  if(f.HasBelowMarketRent) out.push("租金低於市價/受管制");
  if(f.HasIncomeTargeting) out.push("收入審查/目標族群");
  if(f.HasSubsidyOrLoans) out.push("補貼/貸款/稅優惠");
  if(f.LegalDefined) out.push("法律/法規定義");
  if(!out.length) out.push(shortText(d.items[0]?.Definition||"",120));
  return out.slice(0,5);
}

/* =========================================================================
   申請資格（與前版一致，僅在卡片加上 → 優先分配 的連結）
   ======================================================================= */
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
  const resp = await fetch(CSV_ELIGIBILITY,{cache:"no-store"});
  const text = await resp.text();
  const rows = csvParse(text);
  const h = rows[0].map(x=>x.trim());
  const idx = (name)=>h.findIndex(k=>k.toLowerCase()===name.toLowerCase());
  const m = {
    Country: idx("Country"), CountryNormalized: idx("Country_Normalized"),
    All: idx("AllEligible"), Inc: idx("IncomeThreshold"), PR: idx("CitizenshipOrPR"),
    Res: idx("LocalResidency"), Emp: idx("Employment"), Note: idx("OtherNotes"),
  };
  EliState.raw = rows.slice(1).map(r=>({
    c:(r[m.Country]||"").trim(), cn:(r[m.CountryNormalized]||"").trim()||(r[m.Country]||"").trim(),
    All:(r[m.All]||"NA").trim(), Inc:(r[m.Inc]||"NA").trim(), PR:(r[m.PR]||"NA").trim(),
    Res:(r[m.Res]||"NA").trim(), Emp:(r[m.Emp]||"NA").trim(), Note:(r[m.Note]||"").trim()
  })).filter(x=>x.c);
}
function bindEligibilityControls(){
  $("#eli_search").addEventListener("input",e=>{EliState.search=e.target.value.trim().toLowerCase(); renderEligibilityView();});
  $("#eli_sort").addEventListener("change",renderEligibilityView);
  $("#eli_mode").addEventListener("change",e=>{EliState.view=e.target.value; renderEligibilityView();});
  $("#eli_quick").addEventListener("click",(e)=>{
    const t=e.target.closest(".tag"); if(!t) return;
    const [k,v]=t.dataset.q.split(":"); const sel=$("#eli_search"); sel.value=""; EliState.search="";
    EliState.quick={key:k,val:v}; renderEligibilityView();
  });
}
function filterEligibility(data){
  const q = EliState.search; const quick = EliState.quick;
  return data.filter(d=>{
    if(q){ const hay=[d.c,d.cn,d.All,d.Inc,d.PR,d.Res,d.Emp,d.Note].join(" ").toLowerCase(); if(!hay.includes(q)) return false; }
    if(quick){ const mapKey={AllEligible:"All",IncomeThreshold:"Inc",CitizenshipOrPR:"PR",LocalResidency:"Res",Employment:"Emp"}; const val=d[mapKey[quick.key]||quick.key]; if(!val||val.toUpperCase()!==quick.val.toUpperCase()) return false; }
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
function pill(v){ const x=String(v||"NA").trim().toUpperCase(); if(x==="YES")return`<span class="pill y">YES</span>`; if(x==="NO")return`<span class="pill n">NO</span>`; return`<span class="pill na">NA</span>`; }
function renderEligibilityView(){
  const mount=$("#eli_mount"), empty=$("#eli_empty");
  let data = filterEligibility(EliState.raw.slice()); sortEligibility(data);
  if(!data.length){ mount.innerHTML=""; empty.style.display="block"; return; } empty.style.display="none";

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
            <a class="btn" href="#/reassessment?country=${encodeURIComponent(d.cn)}">再審查頻率</a>
            <a class="btn" href="#/priority?country=${encodeURIComponent(d.cn)}">優先分配</a>
          </div>
        </article>`).join("")}
    </div>`;
}

/* =========================================================================
   再審查頻率（與前版一致，僅加入連到優先分配）
   ======================================================================= */
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
  const resp = await fetch(CSV_REASSESSMENT,{cache:"no-store"}); const text = await resp.text();
  const rows = csvParse(text); const h = rows[0].map(x=>x.trim()); const idx = (n)=>h.findIndex(k=>k.toLowerCase()===n.toLowerCase());
  const m = { Country: idx("Country"), Segment: idx("Segment"), CountryNormalized: idx("Country_Normalized"), Freq: idx("StandardizedFrequency"), Detail: idx("Detail") };
  ReaState.raw = rows.slice(1).map(r=>({
    c:(r[m.Country]||"").trim(), seg:(r[m.Segment]||"").trim(), cn:(r[m.CountryNormalized]||"").trim()||(r[m.Country]||"").trim(),
    freq:(r[m.Freq]||"").trim(), detail:(r[m.Detail]||"").trim()
  })).filter(x=>x.c);
  if(ReaState.preselectCountry){ ReaState.search=ReaState.preselectCountry.toLowerCase(); const input=$("#rea_search"); if(input) input.value=ReaState.preselectCountry; }
}
function bindReassessmentControls(){ $("#rea_search").addEventListener("input",e=>{ReaState.search=e.target.value.trim().toLowerCase(); renderReassessmentTable();}); $("#rea_sort").addEventListener("change",e=>{ReaState.sort=e.target.value; renderReassessmentTable();}); }
function filterReassessment(d){ const q=ReaState.search; if(!q) return d; return d.filter(x=>[x.c,x.seg,x.cn,x.freq,x.detail].join(" ").toLowerCase().includes(q)); }
function sortReassessment(arr){
  if(ReaState.sort==="freq"){
    const order=["Annually","Every 6 months","Bi-annually","Continuous review","Lease-end / ad hoc","At lease expiration (usually every 3 years)","Every 5 years","Varies (typically every 3 years)","Depends on local management","Re-assessed (timing unspecified)","Yes (unspecified)","No regular reassessment","NA"];
    const score=v=>{const i=order.indexOf(v);return i===-1?999:i;}; arr.sort((a,b)=>score(a.freq)-score(b.freq)||a.cn.localeCompare(b.cn));
  }else arr.sort((a,b)=>a.cn.localeCompare(b.cn));
}
function renderReassessmentTable(){
  const mount=$("#rea_mount"), empty=$("#rea_empty");
  let data = filterReassessment(ReaState.raw.slice()); sortReassessment(data);
  if(!data.length){ mount.innerHTML=""; empty.style.display="block"; return; } empty.style.display="none";
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
      <a class="btn" href="#/definitions">→ 社宅定義</a>
    </div>`;
}

/* =========================================================================
   優先分配條件（新增頁） — 矩陣（Yes/No/NA）+ 搜尋 + 快速條件
   ======================================================================= */
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
  const resp = await fetch(CSV_PRIORITY,{cache:"no-store"});
  const text = await resp.text();
  const rows = csvParse(text);
  const h = rows[0].map(x=>x.trim()); const idx=(n)=>h.findIndex(k=>k.toLowerCase()===n.toLowerCase());
  const m = {
    Country: idx("Country"), CountryNormalized: idx("Country_Normalized"),
    Wait: idx("TimeOnWaitingList"), Income: idx("IncomeLevel"), Dis: idx("Disability"), Eld: idx("Elderly"),
    Asy: idx("AsylumSeekers"), Eth: idx("EthnicOrRacialMinority"), HH: idx("HouseholdCompositionOrSize"),
    Cond: idx("CurrentHousingConditions"), Note: idx("OtherNotes")
  };
  PriState.raw = rows.slice(1).map(r=>({
    c:(r[m.Country]||"").trim(), cn:(r[m.CountryNormalized]||"").trim()||(r[m.Country]||"").trim(),
    Wait:(r[m.Wait]||"NA").trim(), Income:(r[m.Income]||"NA").trim(), Dis:(r[m.Dis]||"NA").trim(),
    Eld:(r[m.Eld]||"NA").trim(), Asy:(r[m.Asy]||"NA").trim(), Eth:(r[m.Eth]||"NA").trim(),
    HH:(r[m.HH]||"NA").trim(), Cond:(r[m.Cond]||"NA").trim(), Note:(r[m.Note]||"").trim()
  })).filter(x=>x.c);

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

function pill(v){ const x=String(v||"NA").trim().toUpperCase(); if(x==="YES")return`<span class="pill y">YES</span>`; if(x==="NO")return`<span class="pill n">NO</span>`; return`<span class="pill na">NA</span>`; }
function filterPriority(data){
  const q=PriState.search, quick=PriState.quick;
  return data.filter(d=>{
    if(q){
      const hay=[d.c,d.cn,d.Wait,d.Income,d.Dis,d.Eld,d.Asy,d.Eth,d.HH,d.Cond,d.Note].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
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
  if(!data.length){ mount.innerHTML=""; empty.style.display="block"; return; } empty.style.display="none";

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
    </div>
  `;
}
