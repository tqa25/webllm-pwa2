// @version v1.1.0 (2025-10-25): global debug log across actions, mobile sidebar toggle, improved bubble colors
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

const VERSION = "v1.1.0";
const $ = (q) => document.querySelector(q);
const appState = {
  engine: null,
  abortCtrl: null,
  messages: [],            // {role:'user'|'assistant'|'system', content:string}
  loadedModelId: null,
  busy: false
};

// ---------- UI refs ----------
const selModel = $("#modelSelect");
const btnInit = $("#btnInit");
const btnRelease = $("#btnRelease");
const btnNew = $("#btnNew");
const btnExport = $("#btnExport");
const btnTheme = $("#btnTheme");
const btnClearCache = $("#btnClearCache");
const progressEl = $("#progress");
const progressText = $("#progressText");
const statusBadge = $("#statusBadge");
const envInfo = $("#envInfo");
const logEl = $("#log");
const loadedModelChip = $("#loadedModel");
const usageStats = $("#usageStats");
const messagesEl = $("#messages");
const inputEl = $("#input");
const btnSend = $("#btnSend");
const btnStop = $("#btnStop");
const btnMenu = $("#btnMenu");
const sidebar = $("#sidebar");
const backdrop = $("#backdrop");

// ---------- Helpers ----------
function setBadge(text, tone="gray"){
  statusBadge.textContent = text;
  statusBadge.className = "badge " + tone;
}
function setChip(text){ loadedModelChip.textContent = text; }
function pad2(n){ return String(n).padStart(2,"0"); }
function ts(){
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function logEvent(scope, msg){
  logEl.textContent += `[${ts()}] ${scope} — ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}
function saveHistory(){
  localStorage.setItem("webllm_chat_history", JSON.stringify(appState.messages));
  localStorage.setItem("webllm_loaded_model", appState.loadedModelId || "");
  localStorage.setItem("webllm_version", VERSION);
}
function loadHistory(){
  try{
    const m = JSON.parse(localStorage.getItem("webllm_chat_history")||"[]");
    if(Array.isArray(m)) appState.messages = m;
    appState.loadedModelId = localStorage.getItem("webllm_loaded_model") || null;
  }catch(e){}
}
function renderMessages(){
  messagesEl.innerHTML = "";
  for(const msg of appState.messages){
    const el = document.createElement("div");
    el.className = "msg " + (msg.role === "user" ? "user" : "assistant");
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = msg.role === "user" ? "U" : "A";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = formatMarkdownBasic(msg.content);
    el.append(avatar,bubble);
    messagesEl.append(el);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function formatMarkdownBasic(text){
  const fenced = text.replace(/```([\s\S]*?)```/g, (_,code) => `<pre class="code">${escapeHtml(code)}</pre>`);
  const inline = fenced.replace(/`([^`]+)`/g, (_,code)=>`<code class="code">${escapeHtml(code)}</code>`);
  return inline.replace(/\n\n+/g, "<br/><br/>").replace(/\n/g,"<br/>");
}
const escapeHtml = (s)=>s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
function setProgress(v, label){ progressEl.value = v ?? 0; progressText.textContent = label || ""; }
function ensureTheme(){ const t = localStorage.getItem("theme") || "dark"; document.body.classList.toggle("light", t==="light"); }
function toggleTheme(){ const next = document.body.classList.contains("light") ? "dark":"light"; localStorage.setItem("theme", next); ensureTheme(); }

// ---------- Mobile sidebar toggle ----------
function openSidebar(){ document.body.classList.add("sidebar-open"); }
function closeSidebar(){ document.body.classList.remove("sidebar-open"); }
btnMenu?.addEventListener("click", openSidebar);
backdrop?.addEventListener("click", closeSidebar);

// ---------- WebGPU check ----------
async function ensureWebGPU(){
  if(!("gpu" in navigator)) throw new Error("Trình duyệt không hỗ trợ WebGPU.");
  const adapter = await navigator.gpu.requestAdapter();
  if(!adapter) throw new Error("Không lấy được GPU adapter.");
  const info = await adapter.requestAdapterInfo?.().catch(()=>null);
  envInfo.textContent = info ? `GPU: ${info.description || info.vendor || "Unknown"}` : "GPU adapter OK";
}

// ---------- Engine lifecycle ----------
function bindProgressViaOption(){
  // NOTE: theo docs WebLLM, có thể truyền initProgressCallback khi tạo MLCEngine hoặc khi CreateMLCEngine/reload
  // https://webllm.mlc.ai/docs/user/basic_usage.html
}

async function initEngine(){
  try{
    logEvent("ENGINE","Init yêu cầu");
    setBadge("Đang kiểm tra WebGPU...", "gray");
    await ensureWebGPU();

    setBadge("Khởi tạo...", "gray");
    if (!appState.engine){
      appState.engine = new webllm.MLCEngine({
        initProgressCallback: (r)=>{
          if (r?.progress != null) setProgress(r.progress, r.text || "");
          if (r?.text) logEvent("LOAD", r.text);
        }
      });
      logEvent("ENGINE","Tạo MLCEngine");
    }
    const modelId = selModel.value;
    setChip(`Đang nạp: ${modelId}`);
    logEvent("ENGINE", `reload(${modelId}) bắt đầu`);
    await appState.engine.reload(modelId, {});
    appState.loadedModelId = modelId;
    setBadge("Đã nạp model","green");
    setChip(`Đã nạp: ${modelId}`);
    setProgress(1,"Hoàn tất");
    logEvent("ENGINE", `reload(${modelId}) hoàn tất`);
    saveHistory();
    closeSidebar(); // auto ẩn sidebar trên mobile sau khi nạp
  }catch(err){
    setBadge("Lỗi khởi tạo", "gray");
    setChip("Chưa nạp model");
    setProgress(0, String(err.message || err));
    logEvent("ERROR", "Init failed: " + (err.message || err));
  }
}

async function releaseEngine(){
  try{
    if (appState.engine){
      logEvent("ENGINE","unload() bắt đầu");
      await appState.engine.unload();
      logEvent("ENGINE","unload() hoàn tất");
    }
    appState.loadedModelId = null;
    setBadge("Đã giải phóng","gray");
    setChip("Chưa nạp model");
    setProgress(0,"Đã giải phóng");
    saveHistory();
  }catch(e){
    logEvent("ERROR","Unload error: " + (e.message || e));
  }
}

// ---------- Chat ----------
function pushUser(text){
  appState.messages.push({role:"user", content:text});
  renderMessages(); saveHistory();
}
function updateAssistantStreaming(tmpText){
  const last = appState.messages[appState.messages.length-1];
  if (!last || last.role!=="assistant"){
    appState.messages.push({role:"assistant", content:tmpText});
  } else {
    last.content = tmpText;
  }
  renderMessages(); saveHistory();
}

async function sendMessage(){
  const text = inputEl.value.trim();
  if(!text) return;
  if(!appState.engine || !appState.loadedModelId){
    logEvent("WARN","Gửi khi chưa nạp model");
    return;
  }
  if (appState.busy){
    logEvent("WARN","Đang bận, bỏ qua gửi mới");
    return;
  }
  appState.busy = true;
  pushUser(text);
  inputEl.value = ""; inputEl.style.height = "auto";
  appState.abortCtrl = new AbortController();
  const signal = appState.abortCtrl.signal;
  usageStats.textContent = "Đang tạo phản hồi...";
  logEvent("CHAT","Bắt đầu generate");

  try{
    const completion = await appState.engine.chat.completions.create({
      stream:true,
      messages: [
        { role:"system", content:"You are a helpful assistant." },
        ...appState.messages.map(m=>({role:m.role, content:m.content}))
      ],
      stream_options: { include_usage: true },
      signal
    });

    let acc = "";
    let lastUsage = null;
    let tick = 0;

    for await (const chunk of completion){
      const delta = chunk?.choices?.[0]?.delta?.content || "";
      if (delta){
        acc += delta;
        updateAssistantStreaming(acc);
        if ((++tick % 10) === 0) logEvent("STREAM","… nhận thêm token");
      }
      if (chunk?.usage) lastUsage = chunk.usage;
      const extra = chunk?.extra;
      if (extra?.perf){
        const { prefill_tokens_per_s, decode_tokens_per_s } = extra.perf;
        usageStats.textContent = `Prefill: ${prefill_tokens_per_s?.toFixed?.(1) || "?"} tok/s · Decode: ${decode_tokens_per_s?.toFixed?.(1) || "?"} tok/s`;
      }
    }
    if (acc === "") updateAssistantStreaming("");

    if (lastUsage){
      const { prompt_tokens, completion_tokens, total_tokens } = lastUsage;
      usageStats.textContent = `Tokens — prompt: ${prompt_tokens ?? "?"}, completion: ${completion_tokens ?? "?"}, total: ${total_tokens ?? "?"}`;
      logEvent("CHAT", `Hoàn tất · tokens: p=${prompt_tokens}, c=${completion_tokens}, t=${total_tokens}`);
    } else {
      logEvent("CHAT","Hoàn tất (không có usage ở chunk cuối)");
    }
  }catch(err){
    if (signal.aborted){
      usageStats.textContent = "Đã dừng.";
      logEvent("CHAT","Đã dừng theo yêu cầu");
    } else {
      usageStats.textContent = "Lỗi.";
      logEvent("ERROR","Chat error: " + (err.message || err));
    }
  }finally{
    appState.abortCtrl = null;
    appState.busy = false;
  }
}

function stopGeneration(){
  try{
    if (appState.abortCtrl){ appState.abortCtrl.abort(); }
  }catch(e){ logEvent("ERROR","Abort error: " + (e.message || e)); }
}

// ---------- Events ----------
btnInit.addEventListener("click", initEngine);
btnRelease.addEventListener("click", releaseEngine);
btnSend.addEventListener("click", sendMessage);
btnStop.addEventListener("click", stopGeneration);
btnNew.addEventListener("click", ()=>{
  appState.messages = [];
  renderMessages(); saveHistory(); usageStats.textContent = "";
  logEvent("UI","New Chat");
});
btnExport.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify({version:VERSION, model:appState.loadedModelId, messages:appState.messages}, null, 2)], {type:"application/json"});
  const u = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {href:u, download:"chat_export.json"});
  a.click(); URL.revokeObjectURL(u);
  logEvent("UI","Export JSON");
});
btnTheme.addEventListener("click", ()=>{ toggleTheme(); logEvent("UI","Toggle theme"); });
btnClearCache.addEventListener("click", ()=>{
  if (confirm("Xoá lịch sử hội thoại?")){
    localStorage.removeItem("webllm_chat_history");
    localStorage.removeItem("webllm_loaded_model");
    appState.messages = []; appState.loadedModelId = null;
    renderMessages(); setChip("Chưa nạp model"); usageStats.textContent = "";
    logEvent("UI","Đã xoá lịch sử");
  }
});

// Auto-resize textarea & Shift+Enter
inputEl.addEventListener("input", ()=>{
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, window.innerHeight*0.4) + "px";
});
inputEl.addEventListener("keydown", (e)=>{
  if (e.key === "Enter" && !e.shiftKey){
    e.preventDefault(); btnSend.click();
  }
});

// ---------- Boot ----------
ensureTheme();
loadHistory();
(webllm.prebuiltAppConfig?.model_list || []).forEach(m=>{
  const opt = document.createElement("option");
  opt.value = m.model_id; opt.textContent = m.model_id;
  if (m.model_id === appState.loadedModelId) opt.selected = true;
  selModel.appendChild(opt);
});
renderMessages();
setChip(appState.loadedModelId ? `Đã nạp: ${appState.loadedModelId}` : "Chưa nạp model");
envInfo.textContent = `Phiên bản UI: ${VERSION}`;
setBadge("Chưa khởi tạo","gray");
setProgress(0,"Chưa tải");
logEvent("BOOT", `UI ${VERSION} khởi động`);
