/* =========================================================================
   國際住宅數據庫 — Home + 路由 + 兩主題互連
   - #/definitions  社宅定義（多筆同國合併）
   - #/eligibility  社宅申請資格（矩陣 / 卡片）
   ======================================================================= */

/** 資料位置（你也可改指向 main 分支最新檔案） */
const CSV_DEFINITIONS = "https://raw.githubusercontent.com/PN0929/globalhousingdata/3c9bdf0d7ad4bd2cc65b670a45ddc99ffc0d3de9/data/social_housing_definitions_clean_utf8.csv";
const CSV_ELIGIBILITY = "https://raw.githubusercontent.com/PN0929/globalhousingdata/main/data/social_rental_housing_eligibility_clean_utf8.csv";

/** 主題清單（首頁卡片） */
const TOPICS = [
  { slug: "definitions", emoji: "🏘️", title: "各國社宅定義", desc: "各國對 social housing 的稱呼與定義，比較差異", available: true,  cta: "開始探索" },
  { slug: "eligibility", emoji: "🧾", title: "社宅申請資格", desc: "誰能申請？收入門檻、公民/PR、在地居住等一覽",   available: true,  cta: "查看矩陣" }
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

/* ============ 路由 ============ */
window.addEventListener("DOMContentLoaded", () => {
  renderRoute();
  window.addEventListener("hashchange", renderRoute);
});
function setActive(route){
  $$(".topnav .nav-link").forEach(a=>a.classList.remove("active"));
  const m = route.replace(/^#\//,"") || "";
  const el = $(`.topnav .nav-link[data-route="${m||'home'}"]`); if(el) el.classList.add("active");
}
function renderRoute(){
  const hash = (location.hash || "#/").replace(/^#/, "");
  const main = $(".main-content"); main.innerHTML = "";
  setActive(hash);

  if(hash.startsWith("/definitions")) renderDefinitions(main);
  else if(hash.startsWith("/eligibility")) renderEligibility(main);
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

  grid.addEventListener("click",(e)=>{
    const card = e.target.closest(".topic-card"); if(!card) return;
    location.hash = `#/${card.dataset.slug}`;
  });
}

/* =========================================================================
   社宅定義（沿用你之前版本：同國合併、展開全文、加入比較）
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
  const section = document.createElement("section");
  section.id="definitionsExplorer";
  section.innerHTML = `
    <div class="controls fade-in">
      <div class="searchbox"><input id="def_search" type="text" placeholder="搜尋國家、稱呼或定義關鍵字…" /></div>
      <div class="selectbox"><select id="def_country"></select></div>
      <div class="tags" id="def_tags"></div>
      <div class="modebox"><a class="btn" href="#/eligibility">→ 前往申請資格</a></div>
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
  wrap.innerHTML = DefState.filtered.map((d,idx)=>{
    const chips = TAG_RULES.filter(t=>d.flagsCombined[t.key]).slice(0,3).map(t=>`<span class="chip">${t.label}</span>`).join("");
    const checked = DefState.compareSet.has(d.Country) ? "checked" : "";
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
          <label class="mini"><input type="checkbox" class="cmp" data-country="${escapeHTML(d.Country)}" ${checked}/> 加入比較</label>
        </div>
        <div class="summary">${escapeHTML(d.items[0]?.short || "")}</div>
        <div class="actions">
          <button class="btn toggle">展開全文</button>
          ${multiple?`<span class="badge">共 ${d.items.length} 個定義</span>`:""}
          <div class="chips">${chips}</div>
        </div>
        <div class="fulltext" style="display:none;">${variants}</div>
        <div class="actions" style="margin-top:8px">
          <a class="btn" href="#/eligibility">→ 查看此國家申請資格</a>
        </div>
      </article>`;
  }).join("");

  // 事件委派
  wrap.onclick = (e)=>{
    const btn = e.target.closest(".toggle");
    const cmp = e.target.closest("input.cmp");
    if(btn){
      const card = e.target.closest(".card");
      const full = $(".fulltext",card);
      const open = full.style.display!=="none";
      full.style.display = open ? "none":"block";
      btn.textContent = open ? "展開全文" : "收合全文";
    }else if(cmp){
      const c=cmp.dataset.country;
      if(cmp.checked){
        if(DefState.compareSet.size>=3){ cmp.checked=false; alert("一次最多比較 3 個國家"); return; }
        DefState.compareSet.add(c);
      }else DefState.compareSet.delete(c);
      renderDefCompare();
    }
  };
}
function renderDefCompare(){
  const drawer=$("#def_compare"), list=$("#def_compare_list"), arr=Array.from(DefState.compareSet);
  if(!arr.length){drawer.classList.remove("open"); list.innerHTML=`<div class="mini" style="color:#64748b;">尚未選擇國家。勾選卡片右上「加入比較」。</div>`; return;}
  drawer.classList.add("open");
  list.innerHTML = arr.map(c=>{
    const d=DefState.data.find(x=>x.Country===c);
    const bullets = deriveDefBullets(d).map(b=>`• ${escapeHTML(b)}`).join("<br>");
    const terms = d.termsJoined || (d.items[0]?.TermsUsed || "—");
    return `<div class="compare-item"><h4>${escapeHTML(d.Country)}${d.items.length>1?`（${d.items.length} 個定義）`:""}</h4><div class="mini"><strong>稱呼：</strong>${escapeHTML(terms)}</div><div class="mini" style="margin-top:4px">${bullets}</div></div>`;
  }).join("");
}
function deriveDefBullets(d){
  const f=d.flagsCombined||{}; const out=[];
  if(f.HasPublicProvider) out.push("由公部門/地方政府提供或管理");
  if(f.HasNonProfitProvider) out.push("非營利/合作社為主要提供者之一");
  if(f.HasBelowMarketRent) out.push("租金低於市價或受管制");
  if(f.HasIncomeTargeting) out.push("針對低收入/弱勢族群，需收入審查");
  if(f.HasSubsidyOrLoans) out.push("提供補貼/貸款/稅務優惠等支持");
  if(f.LegalDefined) out.push("有法律/法規上的明確定義");
  if(!out.length) out.push(shortText(d.items[0]?.Definition||"",120));
  return out.slice(0,5);
}

/* =========================================================================
   申請資格（Eligibility）— 矩陣 + 卡片 + 搜尋/篩選
   ======================================================================= */
const EliState = { raw:[], view:"matrix", search:"", filters:new Set(["All","Inc","PR","Res","Emp"]) }; // 開站先顯示全部欄位

async function renderEligibility(root){
  const sec=document.createElement("section");
  sec.id="eligibility";
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
        <a class="btn" href="#/definitions">← 回到社宅定義</a>
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
    Country: idx("Country"),
    CountryNormalized: idx("Country_Normalized"),
    All: idx("AllEligible"),
    Inc: idx("IncomeThreshold"),
    PR: idx("CitizenshipOrPR"),
    Res: idx("LocalResidency"),
    Emp: idx("Employment"),
    Note: idx("OtherNotes"),
  };
  EliState.raw = rows.slice(1).map(r=>({
    c: (r[m.Country]||"").trim(),
    cn: (r[m.CountryNormalized]||"").trim() || (r[m.Country]||"").trim(),
    All: (r[m.All]||"NA").trim(),
    Inc: (r[m.Inc]||"NA").trim(),
    PR:  (r[m.PR] ||"NA").trim(),
    Res: (r[m.Res]||"NA").trim(),
    Emp: (r[m.Emp]||"NA").trim(),
    Note:(r[m.Note]||"").trim()
  })).filter(x=>x.c);
}

function bindEligibilityControls(){
  $("#eli_search").addEventListener("input",e=>{EliState.search=e.target.value.trim().toLowerCase(); renderEligibilityView();});
  $("#eli_sort").addEventListener("change",renderEligibilityView);
  $("#eli_mode").addEventListener("change",e=>{EliState.view=e.target.value; renderEligibilityView();});
  $("#eli_quick").addEventListener("click",(e)=>{
    const t=e.target.closest(".tag"); if(!t) return;
    const [k,v]=t.dataset.q.split(":"); // 欄位:Yes
    const sel = $("#eli_search"); sel.value = ""; EliState.search="";
    // 單一條件快速過濾：把非 NA 且等於 v 的留下
    EliState.quick = { key:k, val:v };
    renderEligibilityView();
  });
}

function filterEligibility(data){
  const q = EliState.search;
  const quick = EliState.quick; // {key,val} or undefined
  return data.filter(d=>{
    if(q){
      const hay = [d.c,d.cn,d.All,d.Inc,d.PR,d.Res,d.Emp,d.Note].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(quick){
      const val = d[shortKey(quick.key)];
      if(!val || val.toUpperCase()!==quick.val.toUpperCase()) return false;
    }
    return true;
  });
}
function shortKey(k){ return ({AllEligible:"All",IncomeThreshold:"Inc",CitizenshipOrPR:"PR",LocalResidency:"Res",Employment:"Emp"})[k] || k; }
function sortEligibility(arr){
  const how = $("#eli_sort").value;
  if(how==="score"){
    // Yes = 1（為限制/門檻），No/NA=0；分數高表示條件多
    const score = d => ["Inc","PR","Res","Emp"].reduce((s,k)=>s+(String(d[k]).toUpperCase()==="YES"?1:0), 0);
    arr.sort((a,b)=>score(b)-score(a) || a.cn.localeCompare(b.cn));
  }else{
    arr.sort((a,b)=>a.cn.localeCompare(b.cn));
  }
}

function renderEligibilityView(){
  const mount=$("#eli_mount"), empty=$("#eli_empty");
  let data = filterEligibility(EliState.raw.slice());
  sortEligibility(data);
  if(!data.length){ mount.innerHTML=""; empty.style.display="block"; return; }
  empty.style.display="none";

  if(EliState.view==="matrix") mount.innerHTML = renderMatrix(data);
  else mount.innerHTML = renderEliCards(data);
}

function pill(val){
  const v = String(val||"NA").trim().toUpperCase();
  if(v==="YES") return `<span class="pill y">YES</span>`;
  if(v==="NO")  return `<span class="pill n">NO</span>`;
  return `<span class="pill na">NA</span>`;
}
function renderMatrix(data){
  return `
    <div class="matrix">
      <table class="table">
        <thead>
          <tr>
            <th>Country</th>
            <th>All eligible</th>
            <th>Income</th>
            <th>Citizenship/PR</th>
            <th>Local residency</th>
            <th>Employment</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(d=>`
            <tr>
              <td class="flag"><strong>${escapeHTML(d.c)}</strong></td>
              <td>${pill(d.All)}</td>
              <td>${pill(d.Inc)}</td>
              <td>${pill(d.PR)}</td>
              <td>${pill(d.Res)}</td>
              <td>${pill(d.Emp)}</td>
              <td class="note">${escapeHTML(d.Note||"")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="actions" style="margin:10px 0">
      <a class="btn" href="#/definitions">← 回到社宅定義</a>
    </div>
  `;
}
function renderEliCards(data){
  return `
    <div class="cards">
      ${data.map(d=>`
        <article class="card">
          <div class="card-header">
            <div class="country">${escapeHTML(d.c)}</div>
          </div>
          <div class="summary">
            <span class="chip">All: ${pill(d.All)}</span>
            <span class="chip">Income: ${pill(d.Inc)}</span>
            <span class="chip">Cit/PR: ${pill(d.PR)}</span>
            <span class="chip">Residency: ${pill(d.Res)}</span>
            <span class="chip">Employment: ${pill(d.Emp)}</span>
          </div>
          <div class="fulltext" style="margin-top:10px">${escapeHTML(d.Note||"") || "<span class='note'>—</span>"}</div>
          <div class="actions" style="margin-top:10px">
            <a class="btn" href="#/definitions">查看定義</a>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}
