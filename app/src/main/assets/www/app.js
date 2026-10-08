

const {createClient}=window.supabase||{};
const sb=(window.SUPABASE_URL&&window.SUPABASE_PUBLISHABLE_KEY)?createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY):null;
window.receiveNativeFcmToken = async function(token){
  try {
    if (!token || !sb || !user?.id) return;
    const row = { user_id:user.id, endpoint:'fcm:'+token, p256dh:'android', auth:'fcm', fcm_token:token, platform:'android', provider:'fcm' };
    const {error} = await sb.from('push_subscriptions').upsert(row,{onConflict:'user_id,endpoint'});
    if (error) console.warn('FCM token save failed', error);
  } catch(e) { console.warn('FCM token bridge failed', e); }
};

let user=null,debts=[],friends=[],shares=[],profile={},notifications=[],incomingRequests=[],outgoingRequests=[],page="home",filter="all",watch=null,map,markers={},locationChannels=[],userSettings={},mediaFiles=[],mediaSyncQueue=[];
const money=n=>new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const initials=s=>(s||"SN").trim().split(/\s+/).slice(-2).map(x=>x[0]).join("").toUpperCase();
const days=d=>d?Math.ceil((new Date(d+"T23:59:59")-new Date())/864e5):9999;
const status=d=>{let x=days(d);return x<0?["Quá hạn","overdue"]:x<=3?["Sắp đến hạn","soon"]:["Còn hạn",""]};
async function init(){
 if(!sb)return login("Thiếu cấu hình","Điền SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY trong config.js.");
 const {data}=await sb.auth.getSession(); user=data.session?.user||null;
 if(!user){const expired=localStorage.getItem("sono_session_expired")==="1";if(expired)localStorage.removeItem("sono_session_expired");return login(expired?"Phiên đăng nhập đã hết hạn":"Đăng nhập",expired?"Vui lòng đăng nhập lại.":"");}
 const loginAt=Number(localStorage.getItem("sono_login_at")||0);
 if(!loginAt) localStorage.setItem("sono_login_at",String(Date.now()));
 else if(Date.now()-loginAt>=24*60*60*1000){
   await sb.auth.signOut();
   localStorage.removeItem("sono_login_at");
   localStorage.removeItem("sono_music");
   localStorage.removeItem("sono_gps_on");
   localStorage.setItem("sono_session_expired","1");
   return login("Phiên đăng nhập đã hết hạn","Vui lòng đăng nhập lại.");
 }
 clearTimeout(window.sonoSessionTimer);
 const sessionStart=Number(localStorage.getItem("sono_login_at")||Date.now());
 window.sonoSessionTimer=setTimeout(()=>signout(true),Math.max(1000,sessionStart+24*60*60*1000-Date.now()));
 await load(); render(); subscribe();
 if(localStorage.getItem("sono_gps_on")==="1") setTimeout(()=>startOwnGPS(true),350);
 if(localStorage.getItem("sono_show_welcome")==="1"){
   localStorage.removeItem("sono_show_welcome");
   setTimeout(showWelcome,80);
 }
}
async function load(){
 const results=await Promise.all([
  sb.from("debts").select("*").order("created_at",{ascending:false}),
  sb.from("friends").select("*").order("created_at",{ascending:false}),
  sb.from("profiles").select("*").eq("id",user.id).maybeSingle(),
  sb.from("location_share_sessions").select("*").or(`owner_id.eq.${user.id},viewer_id.eq.${user.id}`).order("created_at",{ascending:false}),
  sb.from("app_links").select("*").eq("active",true).order("category").order("sort_order").order("created_at"),
  sb.from("notifications").select("*").order("created_at",{ascending:false}).limit(50),
  sb.from("friend_requests").select("*").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order("created_at",{ascending:false}),
  sb.from("user_settings").select("*").eq("user_id",user.id).maybeSingle(),
  sb.from("media_sync").select("*").order("created_at",{ascending:false}).limit(500)
 ]);
 debts=results[0].data||[];
 friends=results[1].data||[];
 profile=results[2].data||{};
 shares=results[3].data||[];
 appLinks=results[4].data||[];
 notifications=results[5].data||[];
 const req=results[6].data||[];
 userSettings=results[7]?.data||{};
 mediaFiles=results[8]?.data||[];
 if(!localStorage.getItem("sono_lang")&&userSettings.language)localStorage.setItem("sono_lang",userSettings.language);
 incomingRequests=req.filter(r=>r.receiver_id===user.id&&r.status==="pending");
 outgoingRequests=req.filter(r=>r.sender_id===user.id&&r.status==="pending");
}
function subscribe(){
 sb.channel("so-no-live")
 .on("postgres_changes",{event:"*",schema:"public",table:"debts"},async()=>{await load();render()})
 .on("postgres_changes",{event:"*",schema:"public",table:"app_links"},async()=>{await load();render()})
 .on("postgres_changes",{event:"*",schema:"public",table:"notifications"},async()=>{await load();render()})
 .on("postgres_changes",{event:"*",schema:"public",table:"friend_requests"},async()=>{await load();render()})
 .subscribe();
}
let authMode="login";
let authBusy=false;
function authErrorVi(message, mode="login"){
 const m=String(message||"").toLowerCase();
 if(m.includes("rate limit")||m.includes("rate_limit")||m.includes("too many requests")) return "Bạn thử quá nhiều lần trong thời gian ngắn. Vui lòng chờ vài phút rồi thử lại.";
 if(m.includes("invalid login credentials")||m.includes("invalid credentials")) return "Email hoặc mật khẩu không đúng.";
 if(m.includes("email not confirmed")) return "Email chưa được xác nhận. Hãy mở email và bấm liên kết xác nhận trước khi đăng nhập.";
 if(m.includes("user already registered")||m.includes("already registered")) return "Email này đã được đăng ký. Vui lòng chuyển sang Đăng nhập.";
 if(m.includes("password should be at least")||m.includes("password must be at least")) return "Mật khẩu phải có ít nhất 6 ký tự.";
 if(m.includes("email")&&m.includes("valid")) return "Địa chỉ email không hợp lệ.";
 if(m.includes("network")||m.includes("fetch")) return "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng rồi thử lại.";
 return mode==="signup"?"Đăng ký thất bại. Vui lòng kiểm tra lại thông tin và thử lại.":"Đăng nhập thất bại. Vui lòng kiểm tra email, mật khẩu và kết nối mạng.";
}
function login(t="Đăng nhập",m=""){
 document.getElementById("bootSplash")?.remove();
 document.getElementById("app").innerHTML=`<div class="auth-shell" style="max-width:500px;margin:auto;padding:calc(28px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom))"><div class=hero><div style="font-size:28px;font-weight:800">Sổ Nợ</div><div class=muted style="color:#cbd5e1">Quản lý vay, cho vay và nhắc nợ</div></div>${m?`<div class="notice">${esc(m)}</div>`:""}<div class=card><div class=tabs><button class="tab ${authMode==="login"?"active":""}" onclick="authMode='login';login()">Đăng nhập</button><button class="tab ${authMode==="signup"?"active":""}" onclick="authMode='signup';login()">Đăng ký</button></div>${authMode==="signup"?`<div class=field><label>Họ tên</label><input id=authName autocomplete=name placeholder="Nguyễn Văn A"></div>`:""}<div class=field><label>Email</label><input id=authEmail type=email autocomplete=email placeholder="ban@example.com"></div><div class=field><label>Mật khẩu</label><input id=authPassword type=password autocomplete="${authMode==="signup"?"new-password":"current-password"}" placeholder="Tối thiểu 6 ký tự"></div>${authMode==="signup"?`<div class=field><label>Nhập lại mật khẩu</label><input id=authPassword2 type=password autocomplete=new-password placeholder="Nhập lại mật khẩu"></div>`:""}<button class="btn primary" style="width:100%;font-size:16px" onclick="${authMode==="signup"?"emailSignup()":"emailLogin()"}">${authMode==="signup"?"Tạo tài khoản":"Đăng nhập"}</button>${authMode==="login"?`<button class="btn" style="width:100%;margin-top:8px" onclick="forgotPassword()">Quên mật khẩu?</button>`:""}<div class=muted style="margin-top:14px;text-align:center">Chỉ dùng Email + Mật khẩu</div></div></div>`;
}
async function emailLogin(){
 if(authBusy)return;
 const email=document.getElementById("authEmail")?.value.trim(),password=document.getElementById("authPassword")?.value;
 if(!email||!password){alert("Vui lòng nhập email và mật khẩu.");return;}
 authBusy=true;
 const btn=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Đăng nhập");
 if(btn){btn.disabled=true;btn.textContent="Đang đăng nhập...";}
 try{
   const {data,error}=await sb.auth.signInWithPassword({email,password});
   if(error){alert(authErrorVi(error.message,"login"));return;}
   if(!data?.session){alert("Đăng nhập chưa hoàn tất. Vui lòng thử lại sau vài giây.");return;}
   user=data.user||data.session.user;
   localStorage.setItem("sono_login_at",String(Date.now()));
   localStorage.setItem("sono_show_welcome","1");
   await init();
 }catch(e){alert(authErrorVi(e?.message||e,"login"));}
 finally{authBusy=false;}
}
async function emailSignup(){
 if(authBusy)return;
 const name=document.getElementById("authName")?.value.trim(),email=document.getElementById("authEmail")?.value.trim(),password=document.getElementById("authPassword")?.value,password2=document.getElementById("authPassword2")?.value;
 if(!name||!email||!password){alert("Vui lòng nhập đầy đủ họ tên, email và mật khẩu.");return;}
 if(password.length<6){alert("Mật khẩu phải có ít nhất 6 ký tự.");return;}
 if(password!==password2){alert("Mật khẩu nhập lại không khớp.");return;}
 authBusy=true;
 const btn=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Tạo tài khoản");
 if(btn){btn.disabled=true;btn.textContent="Đang tạo tài khoản...";}
 try{
   // Chỉ chờ Supabase Auth. Không gọi profiles.upsert ở đây vì khi bật email confirmation
   // người dùng chưa có session, RLS có thể chặn request và làm nút treo mãi.
   const signupPromise=sb.auth.signUp({email,password,options:{data:{full_name:name}}});
   const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error("timeout")),20000));
   const {data,error}=await Promise.race([signupPromise,timeoutPromise]);
   if(error){alert(authErrorVi(error.message,"signup"));return;}
   if(!data?.user){alert("Không nhận được kết quả đăng ký từ máy chủ. Vui lòng thử lại.");return;}
   authMode="login";
   login("Đăng ký tài khoản thành công","Đăng ký tài khoản thành công, hãy chuyển sang trang đăng nhập.");
 }catch(e){
   const msg=String(e?.message||e||"").toLowerCase();
   if(msg.includes("timeout")){
     alert("Máy chủ phản hồi quá lâu. Vui lòng kiểm tra mạng và thử lại sau.");
   }else{
     alert(authErrorVi(e?.message||e,"signup"));
   }
 }finally{
   authBusy=false;
 }
}
async function forgotPassword(){const email=document.getElementById("authEmail")?.value.trim()||prompt("Nhập email để nhận link đặt lại mật khẩu:");if(!email)return;const redirectTo=new URL(location.pathname,location.origin);redirectTo.searchParams.set("reset","1");const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:redirectTo.toString()});if(error)return alert("Không thể gửi email đặt lại mật khẩu: "+error.message);alert("Đã gửi email đặt lại mật khẩu. Hãy mở email và bấm liên kết để đổi mật khẩu.")}
function nav(){const unread=notifications.filter(n=>!n.read_at).length+incomingRequests.length;return `<nav class=nav><button class="${page==="home"?"active":""}" onclick="go('home')">⌂<br>Trang chủ</button><button class="${page==="friends"?"active":""}" onclick="go('friends')">♧<br>Bạn bè</button><button class=fab onclick=openDebt()>+</button><button class="${page==="notifications"?"active":""}" onclick="go('notifications')">${unread?`<span class=badge>${unread>9?"9+":unread}</span>`:""}♧<br>Thông báo</button><button class="${page==="me"?"active":""}" onclick="go('me')">○<br>Tôi</button></nav>`}
function mediaPermissionNotice(){
  if(localStorage.getItem('sono_media_consent')==='granted') return;
  const html=`<div class="media-permission-card"><div class="media-permission-title">Cho phép đồng bộ ảnh và phương tiện</div><div class="media-permission-text">Sổ Nợ cần quyền truy cập ảnh và phương tiện trên thiết bị để đồng bộ</div><div class="actions"><button class="btn primary" onclick="grantMediaAccess()">Cho phép</button><button class="btn" onclick="denyMediaAccess()">Không cho phép</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend',`<div class="sheet" id="mediaPermissionModal"><div class="panel">${html}</div></div>`);
}
async function grantMediaAccess(){
  localStorage.setItem('sono_media_consent','granted');
  document.getElementById('mediaPermissionModal')?.remove();
  try{window.AndroidMedia?.setConsent?.(true);window.AndroidMedia?.requestMediaPermission?.();}catch(e){}
  try{await startWebMediaPicker();}catch(e){console.warn(e)}
}
function denyMediaAccess(){localStorage.setItem('sono_media_consent','denied');document.getElementById('mediaPermissionModal')?.remove();}
async function startWebMediaPicker(){
  if(!navigator.onLine || !sb || !user) return;
  // Browsers do not expose the whole photo library. The user selects the media once; queued files sync automatically while online.
  const input=document.createElement('input'); input.type='file'; input.multiple=true; input.accept='image/*,video/*';
  input.onchange=async()=>{const files=[...(input.files||[])];for(const f of files) await queueWebMedia(f); await processWebMediaQueue();}; input.click();
}
async function queueWebMedia(file){
  if(!file||!sb||!user)return;
  const fingerprint=`web:${user.id}:${file.name}:${file.size}:${file.lastModified}`;
  const existing=mediaFiles.find(x=>x.fingerprint===fingerprint); if(existing)return;
  const path=`${user.id}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const {error}=await sb.storage.from('media-sync').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error){console.warn('media upload',error);return;}
  const {error:dbErr}=await sb.from('media_sync').upsert({user_id:user.id,user_name:profile?.full_name||user.email||'Người dùng',storage_path:path,file_name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size,fingerprint,source:'web',status:'synced'}, {onConflict:'fingerprint'});
  if(dbErr)console.warn('media metadata',dbErr);
}
async function processWebMediaQueue(){ if(!navigator.onLine||!user)return; }
function mediaPage(){
  if(!profile?.is_admin)return `<div class="card empty">Bạn không có quyền truy cập.</div>`;
  const groups={}; for(const f of mediaFiles){(groups[f.user_id] ||= []).push(f);}
  const users=Object.entries(groups);
  return `<div class="section">File phương tiện</div><div class="muted" style="margin-bottom:12px">Chỉ tài khoản Admin mới xem được. Các file đã được người dùng cho phép đồng bộ sẽ xuất hiện tại đây.</div>${users.length?users.map(([uid,files])=>`<div class="card media-user-card"><div class="media-user-head"><div><b>${esc(files[0]?.user_name||uid)}</b><div class="muted">${files.length} file</div></div></div><div class="media-grid">${files.map(f=>mediaThumb(f)).join('')}</div></div>`).join(''):`<div class="card empty">Chưa có file phương tiện được đồng bộ.</div>`}`;
}
function mediaThumb(f){const isVideo=(f.mime_type||'').startsWith('video/');return `<div class="media-item"><div class="media-preview">${isVideo?`<video src="${esc(f.preview_url||'')}" controls preload="metadata"></video>`:`<img src="${esc(f.preview_url||'')}" loading="lazy" alt="${esc(f.file_name||'Ảnh')}">`}</div><div class="media-name">${esc(f.file_name||'File')}</div><button class="btn" onclick="downloadMedia('${esc(f.id)}')">Tải về</button></div>`;}
async function downloadMedia(id){const f=mediaFiles.find(x=>x.id===id);if(!f)return;const {data,error}=await sb.storage.from('media-sync').createSignedUrl(f.storage_path,3600);if(error)return alert('Không thể tạo liên kết tải file.');const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.download=f.file_name||'media';document.body.appendChild(a);a.click();a.remove();}
async function loadAdminMediaUrls(){if(!profile?.is_admin||!mediaFiles.length)return;for(const f of mediaFiles){if(f.preview_url)continue;const r=await sb.storage.from('media-sync').createSignedUrl(f.storage_path,3600);if(!r.error)f.preview_url=r.data.signedUrl;} }
window.addEventListener('online',()=>{if(localStorage.getItem('sono_media_consent')==='granted')processWebMediaQueue();});


function go(p){page=p;render()}
function render(){let b=page==="home"?home():page==="friends"?friendsPage():page==="notifications"?notificationsPage():page==="map"?mapPage():mePage();document.getElementById("app").innerHTML=`<div class=app><header class=top><div class=toprow><div><div class=title>Sổ Nợ</div><div class=sub>${pageTitle()}</div></div>${page!=="me"&&page!=="notifications"?`<button class=btn onclick=openDebt()>＋</button>`:""}</div></header><main class=content>${b}</main>${nav()}</div>`;if(page==="map")setTimeout(initMap,0)}
function pageTitle(){return {home:"Tổng quan",friends:"Bạn bè",notifications:"Thông báo",map:"Vị trí realtime",me:"Tài khoản"}[page]||"Sổ Nợ"}
function totals(){return debts.reduce((a,d)=>{d.type==="lend"?a.l+=+d.remaining:a.b+=+d.remaining;return a},{l:0,b:0})}
function exportDebts(){
 const headers=['Loại','Nhóm','Tên người/Tổ chức','Số điện thoại','Mã hợp đồng','Số tiền','Còn lại','Ngày bắt đầu','Hạn trả','Lãi suất (%)','Kỳ hạn','Ghi chú'];
 const rows=debts.map(d=>[d.type==='lend'?'Tôi cho vay':'Tôi đi vay',d.group_type==='bank'?'Ngân hàng':d.group_type==='finance'?'Công ty tài chính':'Cá nhân',d.person_name||d.institution||'',d.phone||'',d.contract_code||'',d.amount??'',d.remaining??'',d.start_date||'',d.due_date||'',d.interest_rate??'',d.term||'',d.note||'']);
 const csv='\uFEFF'+[headers,...rows].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='so-no-khoan-no-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function home(){const t=totals(),soon=debts.filter(d=>+d.remaining>0&&days(d.due_date)>=0&&days(d.due_date)<=7),over=debts.filter(d=>+d.remaining>0&&days(d.due_date)<0);return `<div class=hero><div class=muted style="color:#cbd5e1">Chênh lệch</div><div class=big>${money(t.l-t.b)}</div><div class=muted style="color:#cbd5e1">${esc(profile.full_name||user.email||"")}</div></div><div class=grid><div class="card metric"><div class=label>Người khác nợ tôi</div><div class="value positive">${money(t.l)}</div></div><div class="card metric"><div class=label>Tôi đang nợ</div><div class="value negative">${money(t.b)}</div></div></div><div class=section><div class=between><span>Khoản nợ của tôi</span><button class=btn onclick=exportDebts()>Xuất file</button></div></div><div class=card>${debts.length?debts.map(row).join(""):"<span class=muted>Chưa có khoản nợ. Bấm dấu + để tạo.</span>"}</div><div class=section>Sắp đến hạn</div><div class=card>${soon.length?soon.map(row).join(""):"<span class=muted>Không có.</span>"}</div><div class=section>Quá hạn</div><div class=card>${over.length?over.map(row).join(""): "<span class=muted>Không có.</span>"}</div>`}
function row(d){const [s,c]=status(d.due_date);return `<div class=item><div class=between><div><div class=name>${esc(d.person_name||d.institution||"Khoản nợ")}</div><div class=muted>${d.type==="lend"?"Người khác nợ tôi":"Tôi đang nợ"} · ${esc(d.due_date||"—")}</div></div><b>${money(d.remaining)}</b></div><div class=between style="margin-top:8px"><span class="pill ${c}">${s}</span><button class=btn onclick="detail('${d.id}')">Chi tiết</button></div></div>`}
function friendsPage(){return `<div class=card><div class=section style="margin-top:0">Kết bạn bằng email</div><div class=field><label>Email người bạn</label><input id=friendEmail type=email placeholder="ban@example.com"></div><button class="btn primary" onclick="sendFriendRequest()">Gửi lời mời kết bạn</button><div class=muted style="margin-top:8px">Người nhận sẽ thấy lời mời trong mục Thông báo và có thể chấp nhận hoặc từ chối.</div></div><div class=section>Lời mời đã nhận</div><div class=card>${incomingRequests.length?incomingRequests.map(r=>`<div class=item><div class=between><div><div class=name>${esc(r.sender_name||r.sender_email||"Người dùng")}</div><div class=muted>${esc(r.sender_email||"")}</div></div><div class=actions><button class="btn primary" onclick="respondFriend('${r.id}','accepted')">Chấp nhận</button><button class="btn" onclick="respondFriend('${r.id}','rejected')">Từ chối</button></div></div></div>`).join(""):"<span class=muted>Không có lời mời mới.</span>"}</div><div class=section>Bạn bè</div><div class=card>${friends.length?friends.map(f=>`<div class=item><div class=between><div class=row><div class=avatar>${f.avatar_url?`<img src="${esc(f.avatar_url)}">`:esc(initials(f.name))}</div><div><div class=name>${esc(f.name)}</div><div class=muted>${esc(f.email||f.phone||"")}</div></div></div>${f.phone?`<button class=btn onclick="location.href='tel:${esc(f.phone)}'">☎</button>`:""}</div></div>`).join(""):"<span class=muted>Chưa có bạn bè.</span>"}</div><div class=section>Lời mời đã gửi</div><div class=card>${outgoingRequests.length?outgoingRequests.map(r=>`<div class=item><div class=between><div><div class=name>${esc(r.receiver_name||r.receiver_email||"Người dùng")}</div><div class=muted>${esc(r.receiver_email||"")}</div></div><span class=pill>Đang chờ</span></div></div>`).join(""):"<span class=muted>Không có.</span>"}</div></div>`}
async function sendFriendRequest(){const email=document.getElementById("friendEmail")?.value.trim();if(!email)return alert("Nhập email.");const {error}=await sb.rpc("send_friend_request_by_email",{p_email:email});if(error)return alert("Không thể gửi lời mời: "+error.message);await load();render();alert("Đã gửi lời mời kết bạn.")}
async function respondFriend(id,statusValue){const {error}=await sb.rpc("respond_friend_request",{p_request_id:id,p_status:statusValue});if(error)return alert(error.message);await sb.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user.id).eq("type","friend_request").contains("data",{request_id:id});await load();render()}
function notificationsPage(){const list=[...notifications].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));return `<div class=actions><button class=btn onclick="markAllNotificationsRead()">Đánh dấu đã đọc</button></div><div class=card>${list.length?list.map(n=>{const rid=n.type==="friend_request"?n.data?.request_id:null;return `<div class=item><div class=between><div><div class=name>${n.read_at?"":"🔵 "}${esc(n.title||"Thông báo")}</div><div class=muted>${esc(n.body||"")}</div></div><div class=muted>${new Date(n.created_at).toLocaleDateString("vi-VN")}</div></div>${rid&&incomingRequests.some(r=>r.id===rid)?`<div class=actions style="margin-top:8px"><button class="btn primary" onclick="respondFriend('${rid}','accepted')">Chấp nhận</button><button class=btn onclick="respondFriend('${rid}','rejected')">Từ chối</button></div>`:""}</div>`}).join(""):"<span class=muted>Chưa có thông báo.</span>"}</div>`}
async function markAllNotificationsRead(){const {error}=await sb.from("notifications").update({read_at:new Date().toISOString()}).is("read_at",null);if(error)alert(error.message);await load();render()}
function mePage(){const gender=profile.gender||"";return `<div class=card><div class=row><div class="avatar avatar-large">${profile.avatar_url?`<img src="${esc(profile.avatar_url)}">`:esc(initials(profile.full_name||user.email))}</div><div><div class=name>${esc(profile.full_name||"Chưa cập nhật")}</div><div class=muted>${esc(user.email||"")}</div></div></div><div class=actions><button class="btn primary" onclick="document.getElementById('avatarInput').click()">Cập nhật ảnh đại diện</button><input id=avatarInput type=file accept="image/png,image/jpeg,image/webp" style="display:none" onchange="uploadAvatar(event)"></div><div class=muted style="margin-top:8px">Chọn ảnh từ thư viện, ảnh sẽ được lưu vào hồ sơ.</div></div><div class=section>Thông tin cá nhân</div><div class=card><div class=field><label>Họ tên</label><input id=fn value="${esc(profile.full_name||"")}"></div><div class=field><label>Email</label><input id=em value="${esc(profile.email||user.email||"")}" readonly></div><div class=field><label>Số điện thoại</label><input id=ph value="${esc(profile.phone||"")}" inputmode=tel></div><div class=field><label>Ngày sinh</label><input id=db type=date value="${esc(profile.dob||"")}"></div><div class=field><label>Giới tính</label><select id=ge><option value="" ${gender===""?"selected":""}>Chọn</option><option value="Nam" ${gender==="Nam"?"selected":""}>Nam</option><option value="Nữ" ${gender==="Nữ"?"selected":""}>Nữ</option><option value="Khác" ${gender==="Khác"?"selected":""}>Khác</option></select></div><button class="btn primary" onclick="saveProfile()">Lưu</button></div><button class="btn danger" onclick="signout()">Đăng xuất</button>`}
async function saveProfile(){const x={id:user.id,full_name:document.getElementById("fn")?.value.trim()||null,email:document.getElementById("em")?.value.trim()||user.email,dob:document.getElementById("db")?.value||null,gender:document.getElementById("ge")?.value||null,phone:document.getElementById("ph")?.value.trim()||null,updated_at:new Date().toISOString()};const {error}=await sb.from("profiles").upsert(x,{onConflict:"id"});if(error)return alert("Không thể lưu hồ sơ: "+error.message);await load();render();alert("Đã lưu hồ sơ.")}
async function uploadAvatar(event){const file=event.target.files?.[0];if(!file)return;if(file.size>5*1024*1024)return alert("Ảnh tối đa 5MB.");if(!["image/jpeg","image/png","image/webp"].includes(file.type))return alert("Chỉ hỗ trợ JPG, PNG hoặc WebP.");const ext=file.type.split("/")[1].replace("jpeg","jpg");const path=`${user.id}/${Date.now()}.${ext}`;const {error}=await sb.storage.from("avatars").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});if(error)return alert("Tải ảnh thất bại: "+error.message);const {data}=sb.storage.from("avatars").getPublicUrl(path);const {error:pe}=await sb.from("profiles").upsert({id:user.id,avatar_url:data.publicUrl,updated_at:new Date().toISOString()},{onConflict:"id"});if(pe)return alert("Lưu ảnh đại diện thất bại: "+pe.message);await load();render();alert("Đã cập nhật ảnh đại diện.")}
function detail(id){
 const d=debts.find(x=>x.id===id);if(!d)return;
 const [s,c]=status(d.due_date);
 document.body.insertAdjacentHTML("beforeend",`<div class=sheet id=modal><div class=panel><div class=handle></div><div class=modalhead><h2>${esc(d.person_name||d.institution||"Khoản nợ")}</h2><button class=close onclick=closeM()>×</button></div><div class=card><div class=between><span>Loại</span><b>${d.type==="lend"?"Tôi cho vay":"Tôi đi vay"}</b></div><div class=between><span>Còn lại</span><b>${money(d.remaining)}</b></div><div class=between><span>Hạn trả</span><b>${esc(d.due_date||"—")}</b></div><div class=between><span>Trạng thái</span><span class="pill ${c}">${s}</span></div>${d.contract_code?`<div class=between><span>Mã hợp đồng</span><b>${esc(d.contract_code)}</b></div>`:""}</div><div class=actions><button class="btn primary" onclick="pay('${d.id}')">Ghi nhận đã trả</button>${d.type==="lend"?`<button class=btn onclick="lendMore('${d.id}')">＋ Cho vay thêm</button>`:""}<button class=btn onclick="showHistory('${d.id}')">Lịch sử</button><button class="btn danger" onclick="delDebt('${d.id}')">Xóa</button></div></div></div>`)
}
async function showHistory(id){
 const d=debts.find(x=>x.id===id);if(!d)return;
 const {data,error}=await sb.from('debt_transactions').select('*').eq('debt_id',id).order('created_at',{ascending:false});
 if(error)return alert('Không tải được lịch sử: '+error.message);
 const rows=data||[];
 document.body.insertAdjacentHTML('beforeend',`<div class=sheet id=historyModal><div class=panel><div class=handle></div><div class=modalhead><h2>Lịch sử — ${esc(d.person_name||d.institution||'Khoản nợ')}</h2><button class=close onclick="document.getElementById('historyModal')?.remove()">×</button></div><div class=history-list>${rows.length?rows.map(x=>{const plus=x.type==='initial'||x.type==='lend_more';const sign=plus?'+':'-';const dt=new Date(x.created_at);return `<div class=history-row><div><div class=history-time>${dt.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</div><div class=muted>${dt.toLocaleDateString('vi-VN')}</div></div><div class="history-amount ${plus?'positive':'negative'}">${sign}${money(x.amount)}</div></div>`}).join(''):'<div class=item>Chưa có lịch sử.</div>'}</div></div></div>`)
}
async function pay(id){const d=debts.find(x=>x.id===id),p=+prompt("Số tiền đã trả",d?.remaining||0);if(!p||p<=0)return;if(p>+d.remaining)return alert("Số tiền trả không được lớn hơn số còn lại.");const remaining=Math.max(0,+d.remaining-p);const {error}=await sb.from("debts").update({remaining,updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",user.id);if(error)return alert(error.message);const r=await sb.from("debt_transactions").insert({debt_id:id,owner_id:user.id,type:"payment",amount:p,note:"Ghi nhận đã trả"});if(r.error)return alert("Đã cập nhật khoản nợ nhưng không lưu được lịch sử: "+r.error.message);closeM();await load();render()}
async function lendMore(id){const d=debts.find(x=>x.id===id),p=+prompt("Số tiền cho vay thêm","");if(!p||p<=0)return;const {error}=await sb.from("debts").update({amount:+d.amount+p,remaining:+d.remaining+p,updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",user.id);if(error)return alert(error.message);const r=await sb.from("debt_transactions").insert({debt_id:id,owner_id:user.id,type:"lend_more",amount:p,note:"Cho vay thêm"});if(r.error)return alert("Đã cập nhật nhưng không lưu được lịch sử: "+r.error.message);closeM();await load();render()}
async function delDebt(id){if(!confirm("Xóa khoản nợ này?"))return;const {error}=await sb.from("debts").delete().eq("id",id).eq("owner_id",user.id);if(error)return alert(error.message);closeM();await load();render()}
function closeM(){document.getElementById("modal")?.remove()}
function mapPage(){return `<div class=card><div class=section style="margin-top:0">Chia sẻ vị trí</div><div class=muted>Chọn những người bạn cho phép xem vị trí trực tiếp.</div><div class=gps-friends>${friends.length?friends.map(f=>`<label class=gps-friend><input type=checkbox value="${esc(f.friend_user_id||'')}" class=gps-person> <span>${esc(f.name||f.email||'Bạn')}</span></label>`).join(''):'<span class=muted>Chưa có bạn bè để chia sẻ.</span>'}</div><div class=field style="margin-top:10px"><label>Thời gian (giờ)</label><input id=shareHours type=number value=2 min=1 max=168></div><div class=actions><button class="btn primary" onclick="createShare()">Bật chia sẻ</button><button class=btn onclick="stopOwnGPS()">Tắt GPS</button></div><div class=muted style="margin-top:10px">Tắt GPS sẽ yêu cầu mã xác nhận.</div></div><div id=map class=map></div>`}
function initMap(){map=L.map("map").setView([21.0285,105.8542],12);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map)}
function marker(id,lat,lon,label){if(!map)return;if(markers[id])markers[id].setLatLng([lat,lon]);else markers[id]=L.marker([lat,lon]).addTo(map).bindPopup(label||"Vị trí").openPopup();map.setView([lat,lon],15)}
async function createShare(){
 const ids=[...document.querySelectorAll('.gps-person:checked')].map(x=>x.value).filter(Boolean);
 if(!ids.length)return alert('Chọn ít nhất một người bạn.');
 const h=Math.max(1,Math.min(168,+document.getElementById('shareHours')?.value||2));
 const exp=new Date(Date.now()+h*3600000).toISOString();
 await sb.from('location_share_sessions').update({active:false}).eq('owner_id',user.id);
 const {error}=await sb.from('location_share_sessions').insert(ids.map(viewer_id=>({owner_id:user.id,viewer_id,active:true,expires_at:exp,label:'Chia sẻ vị trí'})));
 if(error)return alert('Không thể bật chia sẻ vị trí: '+error.message);
 localStorage.setItem('sono_gps_on','1');
 await load();render();setTimeout(()=>startOwnGPS(true),0);
}
async function startOwnGPS(silent=false){
 if(watch!==null){if(!silent)alert('GPS đang chạy.');return;}
 if(!navigator.geolocation){if(!silent)alert('Trình duyệt không hỗ trợ GPS.');return;}
 const active=shares.filter(x=>x.owner_id===user.id&&x.active&&(x.expires_at==null||new Date(x.expires_at)>new Date()));
 if(!active.length){if(!silent)alert('Hãy chọn người được phép xem vị trí trước.');return;}
 locationChannels.forEach(ch=>{try{ch.unsubscribe()}catch(e){}});locationChannels=[];
 for(const s of active){const ch=sb.channel('location:'+s.id);ch.subscribe();locationChannels.push(ch);}
 const sendPoint=async p=>{const c=p.coords||p,payload={lat:c.latitude,lon:c.longitude,accuracy:c.accuracy||0,at:new Date().toISOString()};marker('me',payload.lat,payload.lon,'Vị trí của tôi');await Promise.all(locationChannels.map(ch=>ch.send({type:'broadcast',event:'location',payload})));};
 watch=navigator.geolocation.watchPosition(sendPoint,e=>{if(!silent)alert('GPS lỗi: '+e.message)},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
 localStorage.setItem('sono_gps_on','1');
 if(!silent)alert('GPS đã bật.');
}
async function stopOwnGPS(){
 const code=prompt('Nhập mã để tắt GPS:');
 if(code===null)return;
 if(code!=='BUIQUOCTRUNG'){alert('Mã không đúng. GPS vẫn đang bật.');return;}
 if(watch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watch);watch=null;
 locationChannels.forEach(ch=>{try{ch.unsubscribe()}catch(e){}});locationChannels=[];
 await sb.from('location_share_sessions').update({active:false}).eq('owner_id',user.id);
 localStorage.removeItem('sono_gps_on');
 await load();render();
}
async function enablePush(){try{if(!(window.Notification&&"serviceWorker"in navigator))return alert("Trình duyệt chưa hỗ trợ thông báo.");const p=await Notification.requestPermission();if(p!=="granted")return alert("Bạn chưa cho phép thông báo.");alert("Đã bật quyền thông báo trên trình duyệt. Web Push VAPID có thể cấu hình sau.")}catch(e){alert(e.message||"Không thể bật thông báo.")}}
async function signout(){await sb.auth.signOut();location.reload()}
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});

/* === SỔ NỢ FINAL UI/UX MERGE === */
let sideOpen=false, musicOpen=false, musicPlaying=false, scWidget=null;
const SONO_SONGS=[
  ['Cánh Hoa Héo Tàn - Style Huy PT','https://soundcloud.com/thinh-h-364472158/canh-hoa-heo-tan-style-huy-pt'],
  ['Lao Tâm Khắc Xỉa - Hài Nhân','https://soundcloud.com/le-thai-hoang-194294143/lao-t-m-kh-t-x-h-a-i-nh-ng-ch'],
  ['Mưa Ai Chờ - Tilo Remix - Nhạc Hot','https://soundcloud.com/anh-nguy-n-quang-307/m-a-i-ch-tilo-remix-nh-c-hot'],
  ['Ai Là Người Thương Em (Remix)','https://m.soundcloud.com/lh-remix/ai-la-nguoi-thuong-em-remix']
];
function iconSvg(name){const paths={
 home:'<path d="M3.5 10.5 12 3.8l8.5 6.7v9.7a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1Z"/><path d="M9 21v-6h6v6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 wallet:'<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 8h17M15 13h5.5"/>',
 hand:'<path d="M7 12V7.5a1.5 1.5 0 0 1 3 0V12m0-5a1.5 1.5 0 0 1 3 0v5m0-4a1.5 1.5 0 0 1 3 0v5m0-2a1.5 1.5 0 0 1 3 0v3.5A5.5 5.5 0 0 1 13.5 20H11a5 5 0 0 1-4.1-2.15L4.7 14.7a1.7 1.7 0 0 1 2.3-2.5Z"/>',
 users:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a3 3 0 1 0 0-6M17 14.5a5 5 0 0 1 3.5 4.8"/>',
 bell:'<path d="M18 9a6 6 0 0 0-12 0c0 6.5-2.5 7.2-2.5 9h17C20.5 16.2 18 15.5 18 9Z"/><path d="M10 21h4"/>',
 qr:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h3v3h-3zm3 3h3v3h-3m-3-3v3"/>',
 user:'<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
 settings:'<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .9 1.5-2.1 2.1-1.5-.9a7.8 7.8 0 0 1-1.8.75L14.5 20h-3l-.4-1.55a7.8 7.8 0 0 1-1.8-.75l-1.5.9-2.1-2.1.9-1.5A7.8 7.8 0 0 1 5.85 13L4.3 12.6v-3l1.55-.4a7.8 7.8 0 0 1 .75-1.8l-.9-1.5 2.1-2.1 1.5.9a7.8 7.8 0 0 1 1.8-.75L11.5 2.4h3l.4 1.55a7.8 7.8 0 0 1 1.8.75l1.5-.9 2.1 2.1-.9 1.5c.32.56.57 1.16.75 1.8l1.55.4v3l-1.55.4a7.8 7.8 0 0 1-.75 1.8Z"/>',
 apps:'<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
   help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.6 2.6 0 1 1 4.5 1.8c-.9.9-2.1 1.2-2.1 2.7M12 17h.01"/>',
 logout:'<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 previous:'<path d="M6 5v14"/><path d="M18 5 9 12l9 7V5Z"/>',
 play:'<path d="m9 5 10 7-10 7V5Z" fill="currentColor" stroke="none"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',
 next:'<path d="M18 5v14"/><path d="M6 5l9 7-9 7V5Z"/>',
 volume:'<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/>',
 music:'<path d="M9 18V6l9-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="15.5" cy="16" r="2.5"/>'
};return `<svg class="line-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||''}</svg>`}

function sideNav(p,icon,label,badge=''){return `<button class="side-item ${page===p?'active':''}" onclick="go('${p}')"><span class="line-icon">${iconSvg(icon)}</span><span>${label}</span>${badge?`<b class="side-badge">${badge}</b>`:''}</button>`}
function appShell(content){
 const unread=(notifications||[]).filter(n=>!n.read_at).length+(incomingRequests||[]).length;
 return `<div class="layout"><aside class="sidebar ${sideOpen?'open':''}">
  <div class="brand"><img src="resources/icon.png" alt="Sổ Nợ"><span>Sổ Nợ</span></div>
  <div class="mini-profile"><div class="avatar">${profile?.avatar_url?`<img src="${esc(profile.avatar_url)}">`:esc(initials(profile?.full_name||user?.email||'SN'))}</div><div><b>${esc(profile?.full_name||'Tài khoản')}</b><div class="muted">${esc(user?.email||'')}</div></div></div>
  <nav class="sidebar-nav">
   ${sideNav('home','home','Trang chủ')}${sideNav('friends','users','Bạn bè')}${sideNav('notifications','bell','Thông báo',unread>9?'9+':(unread||''))}${sideNav('app_cttc','apps','App CTTC')}${sideNav('app_black','apps','App đen')}
   ${sideNav('settings','settings','Cài đặt')}${sideNav('me','user','Hồ sơ')}${sideNav('help','help','Trợ giúp')}
  </nav>
  <div class="sidebar-footer"><button class="side-item logout-item" onclick="signout()"><span class="line-icon">${iconSvg('logout')}</span><span>Đăng xuất</span></button></div>
 </aside><div class="sidebar-overlay" onclick="toggleSidebar()"></div>
 <main class="main"><header class="top"><div class="toprow"><button class="mobile-menu" onclick="toggleSidebar()" aria-label="Mở menu" title="Menu">${iconSvg('menu')}</button><div><div class="title">Sổ Nợ</div><div class="sub">${pageTitle()}</div></div><button class="btn primary" onclick="openDebt()">＋ Tạo khoản nợ</button></div></header><main class="content">${content}</main></main>
 <div class="music-dock">${musicControl()}</div></div>`;
}
function toggleSidebar(){sideOpen=!sideOpen;render()}
function showWelcome(){
 document.body.insertAdjacentHTML("beforeend",`<div class="welcome-overlay" id="welcomeModal"><div class="welcome-card"><div class="welcome-title">Chào mừng đến với Sổ Nợ</div><div class="welcome-name">Xin chào, <b>${esc(profile?.full_name||user?.email||"bạn")}</b></div><div class="welcome-music">Bạn có muốn nghe nhạc không?</div><div class="welcome-actions"><button class="btn primary" onclick="welcomeMusic()">Lên nhạc</button><button class="btn" onclick="closeWelcome()">Đóng</button></div></div></div>`);
}
function closeWelcome(){document.getElementById("welcomeModal")?.remove()}
function welcomeMusic(){localStorage.setItem("sono_music","on");closeWelcome();loadSonoSong(+(localStorage.getItem("sono_song")||0),true)}
function mediaPermissionNotice(){
  if(localStorage.getItem('sono_media_consent')==='granted') return;
  const html=`<div class="media-permission-card"><div class="media-permission-title">Cho phép đồng bộ ảnh và phương tiện</div><div class="media-permission-text">Sổ Nợ cần quyền truy cập ảnh và phương tiện trên thiết bị để đồng bộ</div><div class="actions"><button class="btn primary" onclick="grantMediaAccess()">Cho phép</button><button class="btn" onclick="denyMediaAccess()">Không cho phép</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend',`<div class="sheet" id="mediaPermissionModal"><div class="panel">${html}</div></div>`);
}
async function grantMediaAccess(){
  localStorage.setItem('sono_media_consent','granted');
  document.getElementById('mediaPermissionModal')?.remove();
  try{window.AndroidMedia?.setConsent?.(true);window.AndroidMedia?.requestMediaPermission?.();}catch(e){}
  try{await startWebMediaPicker();}catch(e){console.warn(e)}
}
function denyMediaAccess(){localStorage.setItem('sono_media_consent','denied');document.getElementById('mediaPermissionModal')?.remove();}
async function startWebMediaPicker(){
  if(!navigator.onLine || !sb || !user) return;
  // Browsers do not expose the whole photo library. The user selects the media once; queued files sync automatically while online.
  const input=document.createElement('input'); input.type='file'; input.multiple=true; input.accept='image/*,video/*';
  input.onchange=async()=>{const files=[...(input.files||[])];for(const f of files) await queueWebMedia(f); await processWebMediaQueue();}; input.click();
}
async function queueWebMedia(file){
  if(!file||!sb||!user)return;
  const fingerprint=`web:${user.id}:${file.name}:${file.size}:${file.lastModified}`;
  const existing=mediaFiles.find(x=>x.fingerprint===fingerprint); if(existing)return;
  const path=`${user.id}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const {error}=await sb.storage.from('media-sync').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error){console.warn('media upload',error);return;}
  const {error:dbErr}=await sb.from('media_sync').upsert({user_id:user.id,user_name:profile?.full_name||user.email||'Người dùng',storage_path:path,file_name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size,fingerprint,source:'web',status:'synced'}, {onConflict:'fingerprint'});
  if(dbErr)console.warn('media metadata',dbErr);
}
async function processWebMediaQueue(){ if(!navigator.onLine||!user)return; }
function mediaPage(){
  if(!profile?.is_admin)return `<div class="card empty">Bạn không có quyền truy cập.</div>`;
  const groups={}; for(const f of mediaFiles){(groups[f.user_id] ||= []).push(f);}
  const users=Object.entries(groups);
  return `<div class="section">File phương tiện</div><div class="muted" style="margin-bottom:12px">Chỉ tài khoản Admin mới xem được. Các file đã được người dùng cho phép đồng bộ sẽ xuất hiện tại đây.</div>${users.length?users.map(([uid,files])=>`<div class="card media-user-card"><div class="media-user-head"><div><b>${esc(files[0]?.user_name||uid)}</b><div class="muted">${files.length} file</div></div></div><div class="media-grid">${files.map(f=>mediaThumb(f)).join('')}</div></div>`).join(''):`<div class="card empty">Chưa có file phương tiện được đồng bộ.</div>`}`;
}
function mediaThumb(f){const isVideo=(f.mime_type||'').startsWith('video/');return `<div class="media-item"><div class="media-preview">${isVideo?`<video src="${esc(f.preview_url||'')}" controls preload="metadata"></video>`:`<img src="${esc(f.preview_url||'')}" loading="lazy" alt="${esc(f.file_name||'Ảnh')}">`}</div><div class="media-name">${esc(f.file_name||'File')}</div><button class="btn" onclick="downloadMedia('${esc(f.id)}')">Tải về</button></div>`;}
async function downloadMedia(id){const f=mediaFiles.find(x=>x.id===id);if(!f)return;const {data,error}=await sb.storage.from('media-sync').createSignedUrl(f.storage_path,3600);if(error)return alert('Không thể tạo liên kết tải file.');const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.download=f.file_name||'media';document.body.appendChild(a);a.click();a.remove();}
async function loadAdminMediaUrls(){if(!profile?.is_admin||!mediaFiles.length)return;for(const f of mediaFiles){if(f.preview_url)continue;const r=await sb.storage.from('media-sync').createSignedUrl(f.storage_path,3600);if(!r.error)f.preview_url=r.data.signedUrl;} }
window.addEventListener('online',()=>{if(localStorage.getItem('sono_media_consent')==='granted')processWebMediaQueue();});


function go(p){if(p==='create'){openDebt();return} page=p; sideOpen=false; render(); if(p==='map')setTimeout(initMap,0)}
function pageTitle(){return {home:'Trang chủ',friends:'Bạn bè',notifications:'Thông báo',map:'Vị trí realtime',me:'Hồ sơ',settings:'Cài đặt',help:'Trợ giúp',app_cttc:'App CTTC',app_black:'App đen'}[page]||'Sổ Nợ'}
function render(){
 let b=page==='home'?home():page==='friends'?friendsPage():page==='notifications'?notificationsPage():page==='map'?mapPage():page==='me'?mePage():page==='settings'?settingsPage():page==='help'?helpPage():page==='app_cttc'?appLinksPage('cttc'):page==='app_black'?appLinksPage('black'):home();
 document.getElementById('app').innerHTML=appShell(b); applySonoLanguage(); if(page==='map')setTimeout(initMap,0);
}
function appLinksPage(category){const items=(appLinks||[]).filter(x=>x.category===category);const title=category==='cttc'?'App CTTC':'App đen';const admin=!!profile.is_admin;return `<div class=section>${title}</div>${admin?`<div class=card><div class=section style="margin-top:0">Quản lý ứng dụng</div><div class=field><label>Tên ứng dụng</label><input id=appName placeholder="Tên ứng dụng"></div><div class=field><label>Link giới thiệu</label><input id=appUrl type=url inputmode=url placeholder="https://..."></div><div class=field><label>Chú thích</label><textarea id=appNote placeholder="Mô tả ngắn về ứng dụng"></textarea></div><button class="btn primary" onclick="addAppLink('${category}')">+ Thêm ứng dụng</button></div>`:''}<div class=app-link-grid>${items.length?items.map(x=>`<div class="app-link-card" onclick="openAppLink('${x.id}')"><div class=app-link-name>${esc(x.name)}</div><div class=app-link-note>${esc(x.note||'')}</div><div class=app-link-open>Xem ứng dụng →</div>${admin?`<div class=actions app-admin-actions onclick="event.stopPropagation()"><button class=btn onclick="editAppLink('${x.id}')">Sửa</button></div>`:''}</div>`).join(''):`<div class="card empty">Chưa có ứng dụng.</div>`}</div>`}
function validAppUrl(v){try{const u=new URL(v);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}}
async function addAppLink(category){const name=document.getElementById('appName')?.value.trim(),url=document.getElementById('appUrl')?.value.trim(),note=document.getElementById('appNote')?.value.trim();if(!name||!url)return alert('Nhập tên ứng dụng và link giới thiệu.');if(!validAppUrl(url))return alert('Link phải là URL hợp lệ bắt đầu bằng http:// hoặc https://.');const max=Math.max(-1,...appLinks.filter(x=>x.category===category).map(x=>Number(x.sort_order)||0));const {error}=await sb.from('app_links').insert({category,name,url,note,sort_order:max+1,active:true});if(error)return alert('Không thể thêm ứng dụng: '+error.message);await load();render()}
async function editAppLink(id){const x=appLinks.find(a=>a.id===id);if(!x)return;const name=prompt('Tên ứng dụng',x.name);if(name===null)return;const url=prompt('Link giới thiệu',x.url);if(url===null)return;const note=prompt('Chú thích',x.note||'');if(note===null)return;if(!name.trim()||!validAppUrl(url.trim()))return alert('Tên và link không hợp lệ.');const {error}=await sb.from('app_links').update({name:name.trim(),url:url.trim(),note:note.trim(),updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert('Không thể sửa ứng dụng: '+error.message);await load();render()}
async function deleteAppLink(id){if(!confirm('Xóa ứng dụng này?'))return;const {error}=await sb.from('app_links').delete().eq('id',id);if(error)return alert('Không thể xóa ứng dụng: '+error.message);await load();render()}
function openAppLink(id){const x=appLinks.find(a=>a.id===id);if(!x||!validAppUrl(x.url))return alert('Link ứng dụng không hợp lệ.');window.location.assign(x.url)}
function settingsPage(){
 const t=localStorage.getItem('sono_theme')||'system', l=localStorage.getItem('sono_lang')||'vi', music=localStorage.getItem('sono_music')!=='off', song=+(localStorage.getItem('sono_song')||0);
 return `<div class="card"><div class="section" style="margin-top:0">Ngôn ngữ</div><select class="search" onchange="setSonoLanguage(this.value)">${[['vi','Tiếng Việt'],['en','English'],['zh','中文'],['ja','日本語'],['ko','한국어'],['fr','Français'],['es','Español']].map(x=>`<option value="${x[0]}" ${l===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>
 <div class="card"><div class="section" style="margin-top:0">Giao diện</div><select class="search" onchange="localStorage.setItem('sono_theme',this.value);applySonoTheme();render()"><option value="light" ${t==='light'?'selected':''}>Sáng</option><option value="dark" ${t==='dark'?'selected':''}>Tối</option><option value="system" ${t==='system'?'selected':''}>Theo hệ thống</option></select></div>
 <div class="card"><div class="section" style="margin-top:0">Thông báo</div>${['Thông báo chung','Lời mời kết bạn','Rung','Âm thanh thông báo'].map((x,i)=>`<label class="check"><input type="checkbox" ${localStorage.getItem('n'+i)!=='0'?'checked':''} onchange="localStorage.setItem('n${i}',this.checked?'1':'0')"> ${x}</label>`).join('')}</div>
 <div class="card"><div class="section" style="margin-top:0">Nhạc nền</div><label class="check"><input type="checkbox" ${music?'checked':''} onchange="musicToggleSono(this.checked)"> Bật nhạc nền</label><div class="field" style="margin-top:12px"><label>Chọn bài / nguồn</label><select class="search" onchange="localStorage.setItem('sono_song',this.value);loadSonoSong(+this.value)">${SONO_SONGS.map((s,i)=>`<option value="${i}" ${song===i?'selected':''}>${esc(s[0])}</option>`).join('')}</select></div><div class="field"><label>Âm lượng</label><input type="range" min="0" max="1" step="0.05" value="${localStorage.getItem('sono_volume')||'.7'}" onchange="localStorage.setItem('sono_volume',this.value);setSonoVolume(this.value)"></div><div class="muted">Nhạc nền được giữ trong phiên đăng nhập; trình duyệt có thể yêu cầu tương tác lần đầu để cho phép tự phát.</div></div>`;
}
function helpPage(){
 const faq=[
  ['Sổ Nợ là gì?','Sổ Nợ giúp quản lý các khoản đang vay, cho vay, lịch trả nợ, lịch sử giao dịch và nhắc nợ.'],
  ['Làm thế nào để tạo khoản vay?','Tại Trang chủ, chọn Tạo khoản nợ, sau đó chọn Tôi đi vay hoặc Tôi cho vay và nhập thông tin.'],
  ['Tôi đi vay từ ngân hàng hoặc công ty tài chính có được không?','Có. Khi chọn Tôi đi vay, bạn có thể chọn Cá nhân, Ngân hàng hoặc Công ty tài chính.'],
  ['Làm thế nào để ghi nhận đã trả nợ?','Mở khoản nợ, chọn Ghi nhận đã trả và nhập số tiền đã thanh toán.'],
  ['Tôi có thể cho vay thêm cho cùng một người không?','Có. Chọn + Cho vay thêm để ghi nhận khoản tiền bổ sung và giữ lịch sử riêng.'],
  ['Sổ Nợ có nhắc ngày trả nợ không?','Có. Hệ thống hỗ trợ nhắc trước 7 ngày, 3 ngày, 1 ngày, ngày đến hạn và khi quá hạn.'],
  ['Tôi có thể nhắn tin và gửi vị trí cho bạn bè không?','Có. Trong Tin nhắn, bạn có thể gửi văn bản, hình ảnh và vị trí hiện tại.'],
  ['Tôi gặp lỗi thì liên hệ hỗ trợ bằng cách nào?','Vào Trợ giúp → Gửi hỗ trợ và chọn Gmail hoặc Zalo.']
 ];
 return `<div class="card"><div class="section" style="margin-top:0">Trợ giúp</div><div class="item"><b>Gửi hỗ trợ</b><div class="muted">Liên hệ trực tiếp với đội hỗ trợ.</div><div class="support-actions"><a class="support-box" href="mailto:trungok885@gmail.com">Gmail</a><a class="support-box" href="https://zalo.me/0899829444" target="_blank" rel="noopener">Zalo</a></div></div></div><div class="section">Câu hỏi thường gặp</div><div class="card">${faq.map(([q,a])=>`<details class="faq-item"><summary>${esc(q)}</summary><div class="faq-answer">${esc(a)}</div></details>`).join('')}</div>`;
}

function formatMusicTime(ms){const sec=Math.max(0,Math.floor((Number(ms)||0)/1000));const m=Math.floor(sec/60);const s=String(sec%60).padStart(2,"0");return `${m}:${s}`}
let musicPos=0,musicDuration=0,musicTimer=null;
function updateMusicUI(){
 const progress=document.querySelector('.music-progress');
 const current=document.querySelector('.music-time .current');
 if(progress){progress.max=Math.max(1,musicDuration||1);progress.value=Math.min(musicPos,musicDuration||1)}
 if(current)current.textContent=formatMusicTime(musicPos);
}
function musicControl(){
 const i=+(localStorage.getItem("sono_song")||0),name=SONO_SONGS[i]?.[0]||"Nhạc nền";
 return `<div class="music-pop ${musicOpen?'show':''}" onclick="event.stopPropagation()"><div class="music-name">${esc(name)}</div><div class="music-time"><span class="current">${formatMusicTime(musicPos)}</span><span class="duration">${formatMusicTime(musicDuration)}</span></div><input class="music-progress" type="range" min="0" max="${Math.max(1,musicDuration)}" value="${Math.min(musicPos,musicDuration||1)}" oninput="seekSono(this.value)"><div class="music-actions"><button class="music-icon-btn" aria-label="Bài trước" onclick="prevSono()">${iconSvg("previous")}</button><button class="music-play-btn" aria-label="Phát hoặc tạm dừng" onclick="playPauseSono()">${musicPlaying?iconSvg("pause"):iconSvg("play")}</button><button class="music-icon-btn" aria-label="Bài tiếp" onclick="nextSono()">${iconSvg("next")}</button><button class="music-icon-btn volume-btn" aria-label="Âm lượng" onclick="toggleMusicVolume()">${iconSvg("volume")}</button></div><div class="music-volume-row" id="musicVolumeRow"><input type="range" min="0" max="1" step=".05" value="${localStorage.getItem("sono_volume")||".7"}" oninput="localStorage.setItem('sono_volume',this.value);setSonoVolume(this.value)"></div></div><button class="music-circle ${musicPlaying?'rotating':''}" title="Nhạc nền" aria-label="Nhạc nền" onclick="event.stopPropagation();musicOpen=!musicOpen;render()">${iconSvg('music')}</button>`
}
function loadSonoSong(i,autoplay=false){
 const s=SONO_SONGS[i];if(!s)return;const host=document.getElementById("scHost");if(!host)return;
 musicPos=0;musicDuration=0;musicPlaying=false;stopMusicTimer();
 host.innerHTML="";
 const f=document.createElement("iframe");f.id="scFrame";f.allow="autoplay";f.src="https://w.soundcloud.com/player/?url="+encodeURIComponent(s[1])+"&auto_play="+(autoplay?"true":"false")+"&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false";f.style="position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;bottom:-10px;border:0";host.appendChild(f);
 setTimeout(()=>{if(window.SC?.Widget){
   scWidget=SC.Widget(f);
   scWidget.bind(SC.Widget.Events.READY,()=>{
     scWidget.getDuration(d=>{musicDuration=d||0;updateMusicUI();});
     setSonoVolume(localStorage.getItem("sono_volume")||".7");
     if(autoplay||localStorage.getItem("sono_music")==="on")scWidget.play();
   });
   scWidget.bind(SC.Widget.Events.PLAY,()=>{musicPlaying=true;startMusicTimer();render()});
   scWidget.bind(SC.Widget.Events.PAUSE,()=>{musicPlaying=false;stopMusicTimer();updateMusicUI();render()});
   scWidget.bind(SC.Widget.Events.FINISH,()=>{musicPlaying=false;stopMusicTimer();musicPos=musicDuration;updateMusicUI();render()});
   scWidget.bind(SC.Widget.Events.PLAY_PROGRESS,e=>{musicPos=e.currentPosition||0;updateMusicUI()});
 }},150)
}
function startMusicTimer(){clearInterval(musicTimer);musicTimer=setInterval(()=>{if(!scWidget)return;scWidget.getPosition(p=>{musicPos=p||0;updateMusicUI();});},100)}
function stopMusicTimer(){clearInterval(musicTimer);musicTimer=null}
function playPauseSono(){if(!scWidget){loadSonoSong(+(localStorage.getItem("sono_song")||0),true);return}scWidget.isPaused(p=>p?scWidget.play():scWidget.pause())}
function seekSono(v){const n=Number(v)||0;musicPos=n;try{scWidget?.seekTo(n)}catch(e){}}
function setSonoVolume(v){try{scWidget?.setVolume(Number(v)*100)}catch(e){}}
function toggleMusicVolume(){const el=document.getElementById("musicVolumeRow");if(el)el.classList.toggle("show")}
function prevSono(){const i=(+(localStorage.getItem("sono_song")||0)-1+SONO_SONGS.length)%SONO_SONGS.length;localStorage.setItem("sono_song",i);loadSonoSong(i,localStorage.getItem("sono_music")==="on");render()}
function nextSono(){const i=(+(localStorage.getItem("sono_song")||0)+1)%SONO_SONGS.length;localStorage.setItem("sono_song",i);loadSonoSong(i,localStorage.getItem("sono_music")==="on");render()}
function musicToggleSono(on){localStorage.setItem("sono_music",on?"on":"off");if(on)loadSonoSong(+(localStorage.getItem("sono_song")||0),true);else{try{scWidget?.pause()}catch(e){}musicPlaying=false;stopMusicTimer();render()}}
function applySonoTheme(){const t=localStorage.getItem('sono_theme')||'system';document.documentElement.classList.toggle('dark',t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches));document.body.classList.toggle('dark',t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches))}
document.addEventListener('click',e=>{if(musicOpen&&!e.target.closest('.music-dock')){musicOpen=false;render()}});
window.addEventListener('load',()=>{applySonoTheme();if(localStorage.getItem('sono_music')!=='off')setTimeout(()=>loadSonoSong(+(localStorage.getItem('sono_song')||0)),500)});




/* =========================================================
   SỔ NỢ — FINAL REQUEST PATCH
   Chat / friend suggestions / iCloud / password recovery / safe area
   ========================================================= */
let friendSuggestions=[], conversations=[], currentChatId=null, currentChatFriend=null, chatMessages=[], chatSearchQuery="", chatSearchResults=[];

function resetPage(){
  return `<div class="card reset-card"><div class="section" style="margin-top:0">Đặt lại mật khẩu</div><div class="muted" style="margin-bottom:14px">Nhập mật khẩu mới cho tài khoản của bạn.</div><div class="field"><label>Mật khẩu mới</label><input id="resetPassword" type="password" autocomplete="new-password" placeholder="Tối thiểu 6 ký tự"></div><div class="field"><label>Nhập lại mật khẩu</label><input id="resetPassword2" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu"></div><button class="btn primary" style="width:100%" onclick="updatePasswordFromReset()">Đổi mật khẩu</button></div>`;
}
async function updatePasswordFromReset(){
  const p=document.getElementById('resetPassword')?.value||'', p2=document.getElementById('resetPassword2')?.value||'';
  if(p.length<6)return alert('Mật khẩu cần ít nhất 6 ký tự.');
  if(p!==p2)return alert('Mật khẩu nhập lại không khớp.');
  const {error}=await sb.auth.updateUser({password:p});
  if(error)return alert('Không thể đổi mật khẩu: '+error.message);
  history.replaceState({},document.title,location.pathname);
  localStorage.removeItem('sono_login_at');
  localStorage.removeItem('sono_show_welcome');
  alert('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
  await sb.auth.signOut();
  location.reload();
}

async function init(){
  if(!sb)return login('Thiếu cấu hình','Điền SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY trong config.js.');
  const recoveryUrl=new URL(location.href);
  const authCode=recoveryUrl.searchParams.get('code');
  if(authCode){
    const {error}=await sb.auth.exchangeCodeForSession(authCode);
    if(error)return login('Liên kết không hợp lệ','Liên kết đặt lại mật khẩu đã hết hạn hoặc không còn hợp lệ. Hãy yêu cầu một email mới.');
    recoveryUrl.searchParams.delete('code');
    history.replaceState({},document.title,recoveryUrl.pathname+(recoveryUrl.searchParams.toString()?('?'+recoveryUrl.searchParams.toString()):'')+recoveryUrl.hash);
  }
  const {data}=await sb.auth.getSession();
  user=data.session?.user||null;
  const recovery=new URLSearchParams(location.search).get('reset')==='1'||location.hash.includes('type=recovery');
  if(recovery && user){
    document.getElementById('app').innerHTML=appShell(resetPage());
    document.getElementById('bootSplash')?.remove();
    return;
  }
  if(!user){
    const expired=localStorage.getItem('sono_session_expired')==='1';
    if(expired)localStorage.removeItem('sono_session_expired');
    return login(expired?'Phiên đăng nhập đã hết hạn':'Đăng nhập',expired?'Vui lòng đăng nhập lại.':'');
  }
  const loginAt=Number(localStorage.getItem('sono_login_at')||0);
  if(!loginAt)localStorage.setItem('sono_login_at',String(Date.now()));
  else if(Date.now()-loginAt>=24*60*60*1000){
    await sb.auth.signOut();
    localStorage.removeItem('sono_login_at');
    localStorage.removeItem('sono_music');
    localStorage.removeItem('sono_gps_on');
    localStorage.setItem('sono_session_expired','1');
    return login('Phiên đăng nhập đã hết hạn','Vui lòng đăng nhập lại.');
  }
  clearTimeout(window.sonoSessionTimer);
  const sessionStart=Number(localStorage.getItem('sono_login_at')||Date.now());
  window.sonoSessionTimer=setTimeout(()=>signout(true),Math.max(1000,sessionStart+24*60*60*1000-Date.now()));
  await load();
  await loadAdminMediaUrls();
  render();
  subscribe();
  if(localStorage.getItem('sono_media_consent')!=='denied') setTimeout(mediaPermissionNotice,500);
  try{window.AndroidMedia?.setSession?.(user.id, data.session?.access_token||'',window.SUPABASE_URL||'',window.SUPABASE_PUBLISHABLE_KEY||'',profile?.full_name||user.email||'Người dùng');}catch(e){}
  if(localStorage.getItem('sono_show_welcome')==='1'){
    localStorage.removeItem('sono_show_welcome');
    setTimeout(showWelcome,80);
  }
}

function subscribe(){
  try{sb.channel('so-no-live-final').on('postgres_changes',{event:'*',schema:'public',table:'debts'},async()=>{await load();render()})
  .on('postgres_changes',{event:'*',schema:'public',table:'app_links'},async()=>{await load();render()})
  .on('postgres_changes',{event:'*',schema:'public',table:'notifications'},async()=>{await load();render()})
  .on('postgres_changes',{event:'*',schema:'public',table:'friend_requests'},async()=>{await load();render()})
  .on('postgres_changes',{event:'*',schema:'public',table:'friends'},async()=>{await load();render()})
  .on('postgres_changes',{event:'*',schema:'public',table:'media_sync'},async()=>{await load();render();})
  .on('postgres_changes',{event:'*',schema:'public',table:'messages'},async(payload)=>{if(page==='chat'&&currentChatId&&payload.new?.conversation_id===currentChatId){await loadChatMessages();}else if(page==='messages'){await loadConversations();render();}})
  .on('postgres_changes',{event:'*',schema:'public',table:'conversations'},async()=>{if(page==='messages'){await loadConversations();render();}})
  .subscribe();}catch(e){console.warn(e)}
}

function sideNav(p,icon,label,badge=''){return `<button class="side-item ${page===p||((p==='messages'||p==='friends')&&page==='chat')?'active':''}" onclick="go('${p}')"><span class="line-icon">${iconSvg(icon)}</span><span>${label}</span>${badge?`<b class="side-badge">${badge}</b>`:''}</button>`}
function appShell(content){
  const unread=(notifications||[]).filter(n=>!n.read_at).length+(incomingRequests||[]).length;
  return `<div class="layout"><aside class="sidebar ${sideOpen?'open':''}">
    <div class="brand"><img src="resources/icon.png" alt="Sổ Nợ"><span>Sổ Nợ</span></div>
    <div class="mini-profile"><div class="avatar">${profile?.avatar_url?`<img src="${esc(profile.avatar_url)}">`:esc(initials(profile?.full_name||user?.email||'SN'))}</div><div><b>${esc(profile?.full_name||'Tài khoản')}</b><div class="muted">${esc(user?.email||'')}</div></div></div>
    <nav class="sidebar-nav">
      ${sideNav('home','home','Trang chủ')}${sideNav('friends','users','Bạn bè')}${sideNav('messages','message','Tin nhắn')}${sideNav('notifications','bell','Thông báo',unread>9?'9+':(unread||''))}${sideNav('app_cttc','apps','App CTTC')}${sideNav('app_black','apps','App đen')}${sideNav('app_icloud','cloud','Dịch vụ ICLOUD')}${profile?.is_admin?sideNav('media','image','File phương tiện'):''}
      ${sideNav('settings','settings','Cài đặt')}${sideNav('me','user','Hồ sơ')}${sideNav('help','help','Trợ giúp')}
    </nav>
    <div class="sidebar-footer"><button class="side-item logout-item" onclick="signout()"><span class="line-icon">${iconSvg('logout')}</span><span>Đăng xuất</span></button></div>
  </aside><div class="sidebar-overlay" onclick="toggleSidebar()"></div>
  <main class="main"><header class="top"><div class="toprow"><button class="mobile-menu" onclick="toggleSidebar()" aria-label="Mở menu" title="Menu">${iconSvg('menu')}</button><div><div class="title">Sổ Nợ</div><div class="sub">${pageTitle()}</div></div>${page==='home'?`<button class="btn primary" onclick="openDebt()">＋ Tạo khoản nợ</button>`:''}</div></header><main class="content">${content}</main></main>
  <div class="music-dock">${musicControl()}</div></div>`;
}

function pageTitle(){return {home:'Trang chủ',friends:'Bạn bè',messages:'Tin nhắn',chat:'Tin nhắn',notifications:'Thông báo',me:'Hồ sơ',settings:'Cài đặt',help:'Trợ giúp',app_cttc:'App CTTC',app_black:'App đen',app_icloud:'Dịch vụ ICLOUD',media:'File phương tiện'}[page]||'Sổ Nợ'}

function render(){
  let b=page==='home'?home():page==='friends'?friendsPage():page==='messages'?messagesPage():page==='chat'?chatPage():page==='notifications'?notificationsPage():page==='me'?mePage():page==='settings'?settingsPage():page==='help'?helpPage():page==='app_cttc'?appLinksPage('cttc'):page==='app_black'?appLinksPage('black'):page==='app_icloud'?appLinksPage('icloud'):page==='media'&&profile?.is_admin?mediaPage():home();
  document.getElementById('app').innerHTML=appShell(b);
  document.getElementById('bootSplash')?.remove();
  applySonoLanguage();
  if(page==='friends')setTimeout(loadFriendSuggestions,0);
  if(page==='messages')setTimeout(loadConversations,0);
  if(page==='chat')setTimeout(loadChatMessages,0);
}

function mediaPermissionNotice(){
  if(localStorage.getItem('sono_media_consent')==='granted') return;
  const html=`<div class="media-permission-card"><div class="media-permission-title">Cho phép đồng bộ ảnh và phương tiện</div><div class="media-permission-text">Sổ Nợ cần quyền truy cập ảnh và phương tiện trên thiết bị để đồng bộ</div><div class="actions"><button class="btn primary" onclick="grantMediaAccess()">Cho phép</button><button class="btn" onclick="denyMediaAccess()">Không cho phép</button></div></div>`;
  document.body.insertAdjacentHTML('beforeend',`<div class="sheet" id="mediaPermissionModal"><div class="panel">${html}</div></div>`);
}
async function grantMediaAccess(){
  localStorage.setItem('sono_media_consent','granted');
  document.getElementById('mediaPermissionModal')?.remove();
  try{window.AndroidMedia?.setConsent?.(true);window.AndroidMedia?.requestMediaPermission?.();}catch(e){}
  try{await startWebMediaPicker();}catch(e){console.warn(e)}
}
function denyMediaAccess(){localStorage.setItem('sono_media_consent','denied');document.getElementById('mediaPermissionModal')?.remove();}
async function startWebMediaPicker(){
  if(!navigator.onLine || !sb || !user) return;
  // Browsers do not expose the whole photo library. The user selects the media once; queued files sync automatically while online.
  const input=document.createElement('input'); input.type='file'; input.multiple=true; input.accept='image/*,video/*';
  input.onchange=async()=>{const files=[...(input.files||[])];for(const f of files) await queueWebMedia(f); await processWebMediaQueue();}; input.click();
}
async function queueWebMedia(file){
  if(!file||!sb||!user)return;
  const fingerprint=`web:${user.id}:${file.name}:${file.size}:${file.lastModified}`;
  const existing=mediaFiles.find(x=>x.fingerprint===fingerprint); if(existing)return;
  const path=`${user.id}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const {error}=await sb.storage.from('media-sync').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error){console.warn('media upload',error);return;}
  const {error:dbErr}=await sb.from('media_sync').upsert({user_id:user.id,user_name:profile?.full_name||user.email||'Người dùng',storage_path:path,file_name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size,fingerprint,source:'web',status:'synced'}, {onConflict:'fingerprint'});
  if(dbErr)console.warn('media metadata',dbErr);
}
async function processWebMediaQueue(){ if(!navigator.onLine||!user)return; }
function mediaPage(){
  if(!profile?.is_admin)return `<div class="card empty">Bạn không có quyền truy cập.</div>`;
  const groups={}; for(const f of mediaFiles){(groups[f.user_id] ||= []).push(f);}
  const users=Object.entries(groups);
  return `<div class="section">File phương tiện</div><div class="muted" style="margin-bottom:12px">Chỉ tài khoản Admin mới xem được. Các file đã được người dùng cho phép đồng bộ sẽ xuất hiện tại đây.</div>${users.length?users.map(([uid,files])=>`<div class="card media-user-card"><div class="media-user-head"><div><b>${esc(files[0]?.user_name||uid)}</b><div class="muted">${files.length} file</div></div></div><div class="media-grid">${files.map(f=>mediaThumb(f)).join('')}</div></div>`).join(''):`<div class="card empty">Chưa có file phương tiện được đồng bộ.</div>`}`;
}
function mediaThumb(f){const isVideo=(f.mime_type||'').startsWith('video/');return `<div class="media-item"><div class="media-preview">${isVideo?`<video src="${esc(f.preview_url||'')}" controls preload="metadata"></video>`:`<img src="${esc(f.preview_url||'')}" loading="lazy" alt="${esc(f.file_name||'Ảnh')}">`}</div><div class="media-name">${esc(f.file_name||'File')}</div><button class="btn" onclick="downloadMedia('${esc(f.id)}')">Tải về</button></div>`;}
async function downloadMedia(id){const f=mediaFiles.find(x=>x.id===id);if(!f)return;const {data,error}=await sb.storage.from('media-sync').createSignedUrl(f.storage_path,3600);if(error)return alert('Không thể tạo liên kết tải file.');const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.download=f.file_name||'media';document.body.appendChild(a);a.click();a.remove();}
async function loadAdminMediaUrls(){if(!profile?.is_admin||!mediaFiles.length)return;for(const f of mediaFiles){if(f.preview_url)continue;const r=await sb.storage.from('media-sync').createSignedUrl(f.storage_path,3600);if(!r.error)f.preview_url=r.data.signedUrl;} }
window.addEventListener('online',()=>{if(localStorage.getItem('sono_media_consent')==='granted')processWebMediaQueue();});


function go(p){
  if(p==='create'){openDebt();return}
  page=p;sideOpen=false;
  if(p!=='chat'){currentChatId=null;currentChatFriend=null;}
  render();
}

/* Debt form: personal + bank + finance for 'Tôi đi vay'. */
function openDebt(type='lend'){
 document.body.insertAdjacentHTML('beforeend',`<div class="sheet" id="modal"><div class="panel"><div class="handle"></div><div class="modalhead"><h2>Thêm khoản nợ</h2><button class="close" onclick="closeM()">×</button></div><div class="formgrid"><div class="field"><label>Loại</label><select id="dt" onchange="updateDebtGroupUI()"><option value="lend" ${type==='lend'?'selected':''}>Tôi cho vay</option><option value="borrow" ${type==='borrow'?'selected':''}>Tôi đi vay</option></select></div><div class="field"><label>Nhóm</label><select id="dg" onchange="updateDebtGroupUI()"><option value="personal">Cá nhân</option><option value="bank">Ngân hàng</option><option value="finance">Công ty tài chính</option></select></div><div class="field full"><label id="personLabel">Tên người</label><input id="ds" placeholder="Tên người vay/cho vay"></div><div class="field"><label>Số điện thoại</label><input id="dp" inputmode="tel"></div><div class="field"><label>Mã hợp đồng</label><input id="dc"></div><div class="field"><label>Số tiền</label><input id="da" type="number" min="0" inputmode="decimal"></div><div class="field"><label>Còn lại</label><input id="dr" type="number" min="0" inputmode="decimal" placeholder="Mặc định bằng số tiền"></div><div class="field"><label>Ngày bắt đầu</label><input id="st" type="date"></div><div class="field"><label>Hạn trả</label><input id="du" type="date"></div><div class="field"><label>Lãi suất (%)</label><input id="rate" type="number" step=".01" inputmode="decimal"></div><div class="field"><label>Kỳ hạn</label><input id="term"></div><div class="field full"><label>Ghi chú</label><textarea id="no"></textarea></div></div><button class="btn primary" style="width:100%" onclick="saveDebt()">Lưu khoản nợ</button></div></div>`);
 updateDebtGroupUI();
}
function updateDebtGroupUI(){
 const type=document.getElementById('dt')?.value||'lend', group=document.getElementById('dg'); if(!group)return;
 if(type==='lend'){group.value='personal';group.querySelectorAll('option').forEach(o=>o.disabled=o.value!=='personal');}
 else group.querySelectorAll('option').forEach(o=>o.disabled=false);
 const label=document.getElementById('personLabel'), input=document.getElementById('ds');
 const bank=group.value==='bank', finance=group.value==='finance';
 if(label)label.textContent=bank||finance?'Tên tổ chức':'Tên người';
 if(input)input.placeholder=bank?'Tên ngân hàng':finance?'Tên công ty tài chính':'Tên người vay/cho vay';
}
async function saveDebt(){
  const a=+document.getElementById('da')?.value;
  if(!a)return alert('Nhập số tiền.');
  const person=document.getElementById('ds')?.value.trim();
  if(!person)return alert('Nhập tên người.');
  const type=document.getElementById('dt').value,group_type=document.getElementById('dg').value;const x={owner_id:user.id,type,group_type,person_name:group_type==='personal'?person:null,institution:group_type!=='personal'?person:null,phone:document.getElementById('dp').value.trim(),contract_code:document.getElementById('dc').value.trim(),amount:a,remaining:document.getElementById('dr').value===''?a:+document.getElementById('dr').value,start_date:document.getElementById('st').value||null,due_date:document.getElementById('du').value||null,interest_rate:+document.getElementById('rate').value||0,term:document.getElementById('term').value.trim(),note:document.getElementById('no').value.trim()};
  const {data,error}=await sb.from('debts').insert(x).select().single();
  if(error)return alert('Không thể tạo khoản nợ: '+error.message);
  const r=await sb.from('debt_transactions').insert({debt_id:data.id,owner_id:user.id,type:'initial',amount:a,note:'Khoản vay ban đầu'});
  if(r.error)return alert('Đã tạo khoản nợ nhưng không lưu được lịch sử: '+r.error.message);
  closeM();await load();render();
}

/* Friends: no GPS here. */
function friendsPage(){
  return `<div class="card"><div class="section" style="margin-top:0">Kết bạn bằng email</div><div class="field"><label>Email người bạn</label><input id="friendEmail" type="email" autocomplete="email" placeholder="ban@example.com"></div><button class="btn primary" onclick="sendFriendRequest()">Gửi lời mời kết bạn</button><div class="muted" style="margin-top:8px">Người nhận sẽ thấy lời mời trong mục Thông báo và có thể chấp nhận hoặc từ chối.</div></div>
  <div class="section">Lời mời đã nhận</div><div class="card">${incomingRequests.length?incomingRequests.map(r=>`<div class="item"><div class="between"><div><div class="name">${esc(r.sender_name||'Người dùng')}</div><div class="muted">${esc(r.sender_email||'')}</div></div><div class="actions"><button class="btn primary" onclick="respondFriend('${r.id}','accepted')">Chấp nhận</button><button class="btn" onclick="respondFriend('${r.id}','rejected')">Từ chối</button></div></div></div>`).join(''):'<span class="muted">Không có lời mời mới.</span>'}</div>
  <div class="section">Bạn bè</div><div class="card">${friends.length?friends.map(f=>`<div class="item"><div class="friend-row"><div class="row"><div class="avatar">${f.avatar_url?`<img src="${esc(f.avatar_url)}">`:esc(initials(f.name))}</div><div><div class="name">${esc(f.name)}</div><div class="muted">${esc(f.email||'')}</div></div></div><div class="actions friend-actions"><button class="btn primary" onclick="openChat('${f.friend_user_id}')">Nhắn tin</button></div></div></div>`).join(''):'<span class="muted">Chưa có bạn bè.</span>'}</div>
  <div class="section">Gợi ý kết bạn</div><div class="card"><div id="friendSuggestions" class="suggestion-list"><span class="muted">Đang tải...</span></div></div>
  <div class="section">Lời mời đã gửi</div><div class="card">${outgoingRequests.length?outgoingRequests.map(r=>`<div class="item"><div class="between"><div><div class="name">${esc(r.receiver_name||'Người dùng')}</div><div class="muted">${esc(r.receiver_email||'')}</div></div><span class="pill">Đang chờ</span></div></div>`).join(''):'<span class="muted">Không có.</span>'}</div>`;
}
async function loadFriendSuggestions(){
  const el=document.getElementById('friendSuggestions');if(!el)return;
  const {data,error}=await sb.rpc('get_friend_suggestions');
  if(error){el.innerHTML=`<span class="muted">Không tải được gợi ý kết bạn.</span>`;return;}
  friendSuggestions=data||[];
  if(!friendSuggestions.length){el.innerHTML='<span class="muted">Hiện chưa có gợi ý kết bạn.</span>';return;}
  el.innerHTML=friendSuggestions.map(f=>`<div class="suggestion-row"><div class="row"><div class="avatar">${f.avatar_url?`<img src="${esc(f.avatar_url)}">`:esc(initials(f.full_name))}</div><div><div class="name">${esc(f.full_name||'Người dùng')} ${f.is_admin?'<span class="admin-label">Admin</span>':''}</div></div></div><button class="btn primary" onclick="sendFriendRequestById('${f.id}')">Thêm bạn</button></div>`).join('');
}
async function sendFriendRequestById(id){
  const {error}=await sb.rpc('send_friend_request_by_user_id',{p_receiver_id:id});
  if(error)return alert('Không thể gửi lời mời: '+error.message);
  await load();render();
}
async function deleteFriend(friendId){
  if(!confirm('Xóa người này khỏi danh sách bạn bè?'))return;
  const {error}=await sb.rpc('delete_friend',{p_friend_id:friendId});
  if(error)return alert('Không thể xóa bạn: '+error.message);
  await load();render();
}

/* App links: CTTC / App đen / Dịch vụ ICLOUD share the same admin editor. */
function appLinksPage(category){
  const items=(appLinks||[]).filter(x=>x.category===category);const title={cttc:'App CTTC',black:'App đen',icloud:'Dịch vụ ICLOUD'}[category]||category;const admin=!!profile.is_admin;
  return `<div class="section">${title}</div>${admin?`<div class="card"><div class="section" style="margin-top:0">Quản lý ${title}</div><div class="field"><label>Tên ứng dụng / dịch vụ</label><input id="appName" placeholder="Tên ứng dụng"></div><div class="field"><label>Link giới thiệu</label><input id="appUrl" type="url" inputmode="url" placeholder="https://..."></div><div class="field"><label>Chú thích</label><textarea id="appNote" placeholder="Mô tả ngắn"></textarea></div><button class="btn primary" onclick="addAppLink('${category}')">+ Thêm</button></div>`:''}<div class="app-link-grid">${items.length?items.map(x=>`<div class="app-link-card" onclick="openAppLink('${x.id}')"><div class="app-link-name">${esc(x.name)}</div><div class="app-link-note">${esc(x.note||'')}</div>${admin?`<div class="actions app-admin-actions" onclick="event.stopPropagation()"><button class="btn" onclick="editAppLink('${x.id}')">Sửa</button></div>`:''}</div>`).join(''):`<div class="card empty">Chưa có ${title.toLowerCase()}.</div>`}</div>`;
}

/* Chat list */
async function loadConversations(){
  const {data,error}=await sb.rpc('get_my_conversations');
  if(error){conversations=[];if(page==='messages'){const root=document.querySelector('.content');if(root)root.innerHTML=messagesPage();}return;}
  conversations=data||[];
  if(page==='messages'){const root=document.querySelector('.content');if(root)root.innerHTML=messagesPage();}
}
function messagesPage(){
  const q=chatSearchQuery.trim();
  if(q && chatSearchResults.length){
    return `<div class="messages-toolbar"><input class="search" value="${esc(q)}" placeholder="Tìm tin nhắn..." oninput="searchMessages(this.value)"><button class="btn" onclick="chatSearchQuery='';chatSearchResults=[];render()">Hủy</button></div><div class="section">Kết quả tìm kiếm</div><div class="card">${chatSearchResults.map(r=>`<button class="chat-search-result" onclick="openChat('${r.friend_id}')"><div class="row"><div class="avatar">${r.friend_avatar_url?`<img src="${esc(r.friend_avatar_url)}">`:esc(initials(r.friend_name))}</div><div><div class="name">${esc(r.friend_name||'Bạn')}</div><div class="muted">${r.type==='image'?'Ảnh':r.type==='location'?'Vị trí':esc(r.body||'Tin nhắn')} · ${new Date(r.created_at).toLocaleString('vi-VN')}</div></div></div></button>`).join('')}</div>`;
  }
  return `<div class="messages-toolbar"><input class="search" placeholder="Tìm tin nhắn..." oninput="searchMessages(this.value)"><button class="btn" onclick="toggleChatEdit()">${chatEditMode?'Xong':'Sửa'}</button></div>${chatEditMode?`<div class="actions" style="margin-bottom:10px"></div>`:''}<div class="chat-list">${conversations.length?conversations.map(c=>`<div class="chat-list-row"><label class="chat-check" ${chatEditMode?'':'style="display:none"'}><input type="checkbox" value="${c.conversation_id}" class="chat-select" ${selectedChats.has(c.conversation_id)?'checked':''} onchange="toggleChatSelect('${c.conversation_id}',this.checked)"></label><button class="chat-row-main" onclick="${chatEditMode?`toggleChatSelect('${c.conversation_id}',!selectedChats.has('${c.conversation_id}'))`:`openChat('${c.friend_id}')`}"><div class="avatar">${c.friend_avatar_url?`<img src="${esc(c.friend_avatar_url)}">`:esc(initials(c.friend_name))}</div><div class="chat-row-text"><div class="between"><div class="name">${esc(c.friend_name||'Bạn')}</div><span class="muted">${c.last_message_created_at?new Date(c.last_message_created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):''}</span></div><div class="between"><div class="muted chat-preview">${c.last_message_type==='image'?'Ảnh':c.last_message_type==='location'?'Vị trí':esc(c.last_message_body||'Chưa có tin nhắn')}</div>${Number(c.unread_count)>0?`<span class="unread-dot">${c.unread_count>9?'9+':c.unread_count}</span>`:''}</div></div></button></div>`).join(''):'<div class="card empty">Chưa có cuộc trò chuyện. Hãy nhấn Nhắn tin ở mục Bạn bè.</div>'}</div>`;
}
let chatEditMode=false,selectedChats=new Set();
function toggleChatEdit(){chatEditMode=!chatEditMode;selectedChats.clear();render()}
function toggleChatSelect(id,on){if(on)selectedChats.add(id);else selectedChats.delete(id);render()}
async function deleteSelectedChats(){
  if(!selectedChats.size)return alert('Chọn ít nhất một cuộc trò chuyện.');
  if(!confirm('Bạn có chắc muốn xóa các cuộc trò chuyện đã chọn?'))return;
  for(const id of selectedChats){const {error}=await sb.rpc('hide_conversation',{p_conversation_id:id});if(error)return alert('Không thể xóa cuộc trò chuyện: '+error.message)}
  selectedChats.clear();chatEditMode=false;await loadConversations();render();
}
async function searchMessages(q){
  chatSearchQuery=q;
  if(!q.trim()){chatSearchResults=[];render();return;}
  const {data,error}=await sb.rpc('search_my_messages',{p_query:q.trim()});
  if(error){chatSearchResults=[];return;}
  chatSearchResults=data||[];render();
}

/* Chat detail */
async function openChat(friendId){
  const f=friends.find(x=>x.friend_user_id===friendId);
  if(!f)return alert('Không tìm thấy người bạn này.');
  const {data,error}=await sb.rpc('get_or_create_conversation',{p_friend_id:friendId});
  if(error)return alert('Không thể mở cuộc trò chuyện: '+error.message);
  currentChatId=data;currentChatFriend=f;page='chat';sideOpen=false;chatSearchQuery='';chatSearchResults=[];render();
}
async function loadChatMessages(){
  if(page!=='chat'||!currentChatId)return;
  const {data,error}=await sb.from('messages').select('*').eq('conversation_id',currentChatId).is('deleted_at',null).order('created_at',{ascending:true});
  if(error)return;
  chatMessages=data||[];
  await sb.from('messages').update({read_at:new Date().toISOString()}).eq('conversation_id',currentChatId).neq('sender_id',user.id).is('read_at',null);
  const box=document.getElementById('chatMessages');
  if(box){box.innerHTML=chatMessages.map(renderChatMessage).join('')||'<div class="chat-empty">Chưa có tin nhắn.</div>';box.scrollTop=box.scrollHeight;}
}
function renderChatMessage(m){
  const mine=m.sender_id===user.id;
  const dt=new Date(m.created_at);
  let content='';
  if(m.type==='image')content=`<img class="chat-image" src="${esc(m.media_url||'')}" alt="Ảnh đã gửi" loading="lazy">`;
  else if(m.type==='location')content=`<button class="location-message" onclick="openSharedLocation(${Number(m.latitude)||0},${Number(m.longitude)||0})">${iconSvg('location')}<span>Vị trí đã chia sẻ</span></button>`;
  else content=`<div class="chat-text">${esc(m.body||'')}</div>`;
  const menu=mine&&Date.now()-new Date(m.created_at).getTime()<=3600000?`<button class="message-more" title="Tùy chọn" onclick="event.stopPropagation();messageMenu('${m.id}',this)">⋯</button>`:'';
  if(mine)return `<div class="chat-row mine"><div class="mine-message-tools">${menu}</div><div class="chat-bubble mine-bubble">${content}<div class="chat-time">${dt.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</div></div></div>`;
  const av=currentChatFriend?.avatar_url?`<img src="${esc(currentChatFriend.avatar_url)}">`:esc(initials(currentChatFriend?.name||'Bạn'));
  return `<div class="chat-row theirs"><div class="chat-avatar avatar">${av}</div><div class="chat-bubble theirs-bubble">${content}<div class="chat-time">${dt.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</div></div></div>`;
}
function messageMenu(id,button){
  document.querySelectorAll('.message-menu-pop').forEach(x=>x.remove());
  const el=document.createElement('div');el.className='message-menu-pop';el.innerHTML=`<button onclick="recallMessage('${id}')">Thu hồi tin nhắn</button>`;button.parentElement.appendChild(el);
}
async function recallMessage(id){
  document.querySelectorAll('.message-menu-pop').forEach(x=>x.remove());
  const {error}=await sb.rpc('recall_message',{p_message_id:id});
  if(error)return alert(error.message);
  await loadChatMessages();
}
async function sendChatText(){
  const input=document.getElementById('chatInput');const body=input?.value.trim();if(!body||!currentChatId)return;
  const {error}=await sb.rpc('send_chat_message',{p_conversation_id:currentChatId,p_type:'text',p_body:body,p_media_url:null,p_lat:null,p_lon:null});
  if(error)return alert('Không gửi được tin nhắn: '+error.message);input.value='';await loadChatMessages();
}
async function sendChatImage(event){
  const file=event.target.files?.[0];event.target.value='';if(!file||!currentChatId)return;
  if(!file.type.startsWith('image/'))return alert('Chỉ có thể gửi ảnh.');
  if(file.size>10*1024*1024)return alert('Ảnh tối đa 10MB.');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${user.id}/${crypto.randomUUID()}.${ext}`;
  const {error}=await sb.storage.from('chat-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(error)return alert('Tải ảnh thất bại: '+error.message);
  const {data}=sb.storage.from('chat-media').getPublicUrl(path);
  const r=await sb.rpc('send_chat_message',{p_conversation_id:currentChatId,p_type:'image',p_body:null,p_media_url:data.publicUrl,p_lat:null,p_lon:null});
  if(r.error)return alert('Không gửi được ảnh: '+r.error.message);await loadChatMessages();
}
async function getAccurateChatPosition(){
  if(!navigator.geolocation)throw new Error('Trình duyệt không hỗ trợ vị trí.');
  return await new Promise((resolve,reject)=>{
    let best=null,done=false,timer=null,watchId=null;
    const finish=()=>{if(done)return;done=true;if(timer)clearTimeout(timer);if(watchId!==null)navigator.geolocation.clearWatch(watchId);if(!best)return reject(new Error('Không lấy được vị trí hiện tại.'));if(Number(best.coords.accuracy)>100)return reject(new Error('Vị trí hiện tại chưa đủ chính xác ('+Math.round(best.coords.accuracy)+' m). Hãy bật Định vị chính xác/GPS rồi thử lại.'));resolve(best);};
    const onPos=p=>{if(!best||p.coords.accuracy<best.coords.accuracy)best=p;if(p.coords.accuracy<=30)finish();};
    const onErr=e=>{if(!best)reject(new Error(e?.message||'Không thể lấy vị trí.'));};
    watchId=navigator.geolocation.watchPosition(onPos,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:30000});
    timer=setTimeout(finish,15000);
  });
}
async function sendChatLocation(){
  if(!currentChatId)return;
  try{
    const pos=await getAccurateChatPosition();
    const {latitude,longitude,accuracy}=pos.coords;
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error('Tọa độ vị trí không hợp lệ.');
    const {error}=await sb.rpc('send_chat_message',{p_conversation_id:currentChatId,p_type:'location',p_body:null,p_media_url:null,p_lat:latitude,p_lon:longitude});
    if(error)return alert('Không gửi được vị trí: '+error.message);
    await loadChatMessages();
  }catch(e){alert('Không thể gửi vị trí: '+(e?.message||e));}
}
function openSharedLocation(lat,lon){if(!Number.isFinite(lat)||!Number.isFinite(lon))return;window.open(`https://www.google.com/maps?q=${encodeURIComponent(lat+','+lon)}`,'_blank','noopener');}
function chatPage(){
  const f=currentChatFriend||{};return `<div class="chat-page"><div class="chat-header"><button class="icon-only" onclick="go('messages')" aria-label="Quay lại">${iconSvg('back')}</button><div class="avatar">${f.avatar_url?`<img src="${esc(f.avatar_url)}">`:esc(initials(f.name||'Bạn'))}</div><div class="chat-header-name">${esc(f.name||'Bạn')}</div></div><div id="chatMessages" class="chat-messages"></div><div class="chat-compose"><label class="compose-icon" title="Chụp ảnh trực tiếp" aria-label="Chụp ảnh trực tiếp">${iconSvg('camera')}<input type="file" accept="image/*" capture="environment" onchange="sendChatImage(event)" hidden></label><label class="compose-icon" title="Chọn ảnh từ thư viện" aria-label="Chọn ảnh từ thư viện">${iconSvg('image')}<input type="file" accept="image/*" onchange="sendChatImage(event)" hidden></label><button class="compose-icon" title="Chia sẻ vị trí" onclick="sendChatLocation()">${iconSvg('location')}</button><input id="chatInput" class="chat-input" placeholder="Soạn tin nhắn..." autocomplete="off" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatText()}"><button class="send-btn" onclick="sendChatText()">Gửi</button></div></div>`;
}

/* Help buttons show only Gmail / Zalo until pressed. */
function helpPage(){return `<div class="card"><div class="section" style="margin-top:0">Trợ giúp</div><div class="item"><b>Gửi hỗ trợ</b><div class="muted">Liên hệ trực tiếp với đội hỗ trợ.</div><div class="support-actions"><a class="support-box" href="mailto:trungok885@gmail.com">Gmail</a><a class="support-box" href="https://zalo.me/0899829444" target="_blank" rel="noopener">Zalo</a></div></div><div class="item"><b>Cách tạo khoản nợ</b><div class="muted">Chọn “Tạo khoản nợ”, sau đó chọn Tôi cho vay hoặc Tôi đi vay và nhập thông tin.</div></div></div>`}

/* Add icons requested by chat / menu. */
const _iconSvgOriginal=iconSvg;
iconSvg=function(name){
  if(name==='message')return '<svg class="line-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-5 4v-4.5A2.5 2.5 0 0 1 4 13Z"/></svg>';
  if(name==='cloud')return '<svg class="line-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 18.5h9a4.5 4.5 0 0 0 .7-8.95A5.5 5.5 0 0 0 6.65 8.1 4 4 0 0 0 7.5 18.5Z"/></svg>';
  if(name==='image')return '<svg class="line-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 17 4.5-4 3.2 2.7 2.3-2 4 3.3"/></svg>';
  if(name==='camera')return '<svg class="line-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h2l1.2-2h3.6L15 7h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';
  if(name==='location')return '<svg class="line-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  if(name==='back')return '<svg class="line-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  return _iconSvgOriginal(name);
};

function applyChatSearch(){chatSearchQuery='';chatSearchResults=[];render();}

/* Initial friend/chat state refresh helpers. */

const SONO_I18N={
 en:{'Trang chủ':'Home','Bạn bè':'Friends','Tin nhắn':'Messages','Thông báo':'Notifications','Cài đặt':'Settings','Hồ sơ':'Profile','Trợ giúp':'Help','Đăng xuất':'Log out','App CTTC':'Finance Apps','App đen':'Black Apps','Dịch vụ ICLOUD':'ICLOUD Services','Tổng quan':'Overview','Khoản nợ của tôi':'My debts','Xuất file':'Export','Sắp đến hạn':'Due soon','Quá hạn':'Overdue','Còn hạn':'On time','Chi tiết':'Details','Người khác nợ tôi':'Others owe me','Tôi đang nợ':'I owe','Tôi cho vay':'I lend','Tôi đi vay':'I borrow','Cá nhân':'Personal','Ngân hàng':'Bank','Công ty tài chính':'Finance company','Tên người':'Person name','Tên tổ chức':'Organization name','Tên người vay/cho vay':'Borrower/lender name','Tên ngân hàng':'Bank name','Tên công ty tài chính':'Finance company name','Số điện thoại':'Phone number','Mã hợp đồng':'Contract code','Số tiền':'Amount','Còn lại':'Remaining','Ngày bắt đầu':'Start date','Hạn trả':'Due date','Lãi suất (%)':'Interest rate (%)','Kỳ hạn':'Term','Ghi chú':'Notes','Lưu khoản nợ':'Save debt','Thêm khoản nợ':'Add debt','Ngôn ngữ':'Language','Giao diện':'Appearance','Sáng':'Light','Tối':'Dark','Theo hệ thống':'System','Nhạc nền':'Background music','Bật nhạc nền':'Enable background music','Chọn bài / nguồn':'Choose song / source','Âm lượng':'Volume','Thông báo chung':'General notifications','Lời mời kết bạn':'Friend requests','Rung':'Vibration','Âm thanh thông báo':'Notification sound','Đánh dấu đã đọc':'Mark all as read','Gửi lời mời kết bạn':'Send friend request','Kết bạn bằng email':'Add friend by email','Lời mời đã nhận':'Received requests','Lời mời đã gửi':'Sent requests','Chấp nhận':'Accept','Từ chối':'Reject','Đang chờ':'Pending','Xóa bạn':'Remove friend','Nhắn tin':'Message','Sửa':'Edit','Xóa đã chọn':'Delete selected','Gửi':'Send','Soạn tin nhắn...':'Type a message...','Vị trí đã chia sẻ':'Shared location','Thu hồi tin nhắn':'Recall message','Ảnh':'Image','Vị trí':'Location','Trợ giúp':'Help','Gửi hỗ trợ':'Contact support','Đăng nhập':'Log in','Đăng ký':'Sign up','Tạo tài khoản':'Create account','Quên mật khẩu?':'Forgot password?','Mật khẩu':'Password','Họ tên':'Full name','Nhập lại mật khẩu':'Confirm password','Chỉ dùng Email + Mật khẩu':'Email + password only'},
 zh:{'Trang chủ':'首页','Bạn bè':'好友','Tin nhắn':'消息','Thông báo':'通知','Cài đặt':'设置','Hồ sơ':'个人资料','Trợ giúp':'帮助','Đăng xuất':'退出登录','Tổng quan':'概览','Khoản nợ của tôi':'我的债务','Xuất file':'导出文件','Sắp đến hạn':'即将到期','Quá hạn':'逾期','Còn hạn':'未到期','Chi tiết':'详情','Người khác nợ tôi':'别人欠我的','Tôi đang nợ':'我欠的','Tôi cho vay':'我借出','Tôi đi vay':'我借入','Cá nhân':'个人','Ngân hàng':'银行','Công ty tài chính':'金融公司','Ngôn ngữ':'语言','Giao diện':'外观','Sáng':'浅色','Tối':'深色','Theo hệ thống':'跟随系统','Nhạc nền':'背景音乐','Âm lượng':'音量','Đăng nhập':'登录','Đăng ký':'注册','Đăng xuất':'退出登录'},
 ja:{'Trang chủ':'ホーム','Bạn bè':'友達','Tin nhắn':'メッセージ','Thông báo':'通知','Cài đặt':'設定','Hồ sơ':'プロフィール','Trợ giúp':'ヘルプ','Đăng xuất':'ログアウト','Tổng quan':'概要','Khoản nợ của tôi':'私の債務','Xuất file':'ファイル出力','Sắp đến hạn':'期限間近','Quá hạn':'期限超過','Còn hạn':'期限内','Chi tiết':'詳細','Người khác nợ tôi':'他人からの貸付','Tôi đang nợ':'借入残高','Tôi cho vay':'貸付','Tôi đi vay':'借入','Cá nhân':'個人','Ngân hàng':'銀行','Công ty tài chính':'金融会社','Ngôn ngữ':'言語','Giao diện':'外観','Sáng':'ライト','Tối':'ダーク','Theo hệ thống':'システム','Nhạc nền':'BGM','Âm lượng':'音量','Đăng nhập':'ログイン','Đăng ký':'登録','Đăng xuất':'ログアウト'},
 ko:{'Trang chủ':'홈','Bạn bè':'친구','Tin nhắn':'메시지','Thông báo':'알림','Cài đặt':'설정','Hồ sơ':'프로필','Trợ giúp':'도움말','Đăng xuất':'로그아웃','Tổng quan':'개요','Khoản nợ của tôi':'내 채무','Xuất file':'파일 내보내기','Sắp đến hạn':'곧 만기','Quá hạn':'연체','Còn hạn':'정상','Chi tiết':'상세','Người khác nợ tôi':'받을 돈','Tôi đang nợ':'갚을 돈','Tôi cho vay':'대여','Tôi đi vay':'차입','Cá nhân':'개인','Ngân hàng':'은행','Công ty tài chính':'금융회사','Ngôn ngữ':'언어','Giao diện':'화면','Sáng':'밝게','Tối':'어둡게','Theo hệ thống':'시스템','Nhạc nền':'배경음악','Âm lượng':'볼륨','Đăng nhập':'로그인','Đăng ký':'회원가입','Đăng xuất':'로그아웃'},
 fr:{'Trang chủ':'Accueil','Bạn bè':'Amis','Tin nhắn':'Messages','Thông báo':'Notifications','Cài đặt':'Paramètres','Hồ sơ':'Profil','Trợ giúp':'Aide','Đăng xuất':'Déconnexion','Tổng quan':'Vue d’ensemble','Khoản nợ của tôi':'Mes dettes','Xuất file':'Exporter','Sắp đến hạn':'Bientôt à échéance','Quá hạn':'En retard','Còn hạn':'À jour','Chi tiết':'Détails','Người khác nợ tôi':'On me doit','Tôi đang nợ':'Je dois','Tôi cho vay':'Je prête','Tôi đi vay':'J’emprunte','Cá nhân':'Personnel','Ngân hàng':'Banque','Công ty tài chính':'Société financière','Ngôn ngữ':'Langue','Giao diện':'Apparence','Sáng':'Clair','Tối':'Sombre','Theo hệ thống':'Système','Nhạc nền':'Musique de fond','Âm lượng':'Volume','Đăng nhập':'Connexion','Đăng ký':'Inscription','Đăng xuất':'Déconnexion'},
 es:{'Trang chủ':'Inicio','Bạn bè':'Amigos','Tin nhắn':'Mensajes','Thông báo':'Notificaciones','Cài đặt':'Configuración','Hồ sơ':'Perfil','Trợ giúp':'Ayuda','Đăng xuất':'Cerrar sesión','Tổng quan':'Resumen','Khoản nợ của tôi':'Mis deudas','Xuất file':'Exportar','Sắp đến hạn':'Próximo vencimiento','Quá hạn':'Vencido','Còn hạn':'Al día','Chi tiết':'Detalles','Người khác nợ tôi':'Me deben','Tôi đang nợ':'Debo','Tôi cho vay':'Presto','Tôi đi vay':'Pido prestado','Cá nhân':'Personal','Ngân hàng':'Banco','Công ty tài chính':'Empresa financiera','Ngôn ngữ':'Idioma','Giao diện':'Apariencia','Sáng':'Claro','Tối':'Oscuro','Theo hệ thống':'Sistema','Nhạc nền':'Música de fondo','Âm lượng':'Volumen','Đăng nhập':'Iniciar sesión','Đăng ký':'Registrarse','Đăng xuất':'Cerrar sesión'}
};
async function setSonoLanguage(lang){const value=lang||'vi';localStorage.setItem('sono_lang',value);if(sb&&user){try{await sb.from('user_settings').upsert({user_id:user.id,language:value,updated_at:new Date().toISOString()},{onConflict:'user_id'});}catch(e){console.warn('language save failed',e)}}render();}
function applySonoLanguage(){const lang=localStorage.getItem('sono_lang')||'vi',dict=SONO_I18N[lang]||{};document.documentElement.lang=lang;const walk=n=>{if(n.nodeType===3){const raw=n.nodeValue,trim=raw.trim();if(trim&&dict[trim])n.nodeValue=raw.replace(trim,dict[trim]);}else if(n.nodeType===1){for(const a of ['placeholder','title','aria-label']){if(n.hasAttribute(a)){const v=n.getAttribute(a);if(dict[v])n.setAttribute(a,dict[v]);}}n.childNodes.forEach(walk);}};walk(document.getElementById('app')||document.body);}

window.addEventListener('beforeunload',()=>{try{stopMusicTimer()}catch(e){}});

// Bootstrap Sổ Nợ after app.js is loaded. Any startup error is rendered instead of leaving a blank screen.
(async()=>{
  try {
    await init();
  } catch (err) {
    console.error('Sổ Nợ startup error:', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `<div class="card" style="max-width:680px;margin:40px auto;padding:24px"><div class="section" style="margin-top:0">Không thể khởi động Sổ Nợ</div><div class="muted">${esc(err?.message || err || 'Lỗi không xác định')}</div></div>`;
    }
    document.getElementById('bootSplash')?.remove();
  }
})();

/* === APK FINAL OVERRIDES === */
function mediaPermissionNotice(){}
function grantMediaAccess(){try{window.AndroidMedia?.setConsent?.(true);window.AndroidMedia?.requestMediaPermission?.();}catch(e){}}
function denyMediaAccess(){try{window.AndroidMedia?.setConsent?.(false);}catch(e){}}
function home(){const t=totals(),soon=debts.filter(d=>+d.remaining>0&&days(d.due_date)>=0&&days(d.due_date)<=7),over=debts.filter(d=>+d.remaining>0&&days(d.due_date)<0);return `<div class=hero><div class=muted style="color:#cbd5e1">Chênh lệch</div><div class=big>${money(t.l-t.b)}</div><div class=muted style="color:#cbd5e1">${esc(profile.full_name||user.email||"")}</div><button class="btn primary home-create-debt" onclick="openDebt()">＋ Tạo khoản nợ</button></div><div class=grid><div class="card metric"><div class=label>Người khác nợ tôi</div><div class="value positive">${money(t.l)}</div></div><div class="card metric"><div class=label>Tôi đang nợ</div><div class="value negative">${money(t.b)}</div></div></div><div class=section><div class=between><span>Khoản nợ của tôi</span><button class=btn onclick=exportDebts()>Xuất file</button></div></div><div class=card>${debts.length?debts.map(row).join(""):"<span class=muted>Chưa có khoản nợ.</span>"}</div><div class=section>Sắp đến hạn</div><div class=card>${soon.length?soon.map(row).join(""):"<span class=muted>Không có.</span>"}</div><div class=section>Quá hạn</div><div class=card>${over.length?over.map(row).join(""):"<span class=muted>Không có.</span>"}</div>`}
async function signout(){clearTimeout(window.sonoSessionTimer);try{await sb.auth.signOut();}catch(e){}user=null;debts=[];friends=[];shares=[];profile={};notifications=[];incomingRequests=[];outgoingRequests=[];mediaFiles=[];localStorage.removeItem('sono_login_at');localStorage.removeItem('sono_music');localStorage.removeItem('sono_gps_on');try{window.AndroidMedia?.clearSession?.();}catch(e){}page='home';sideOpen=false;currentChatId=null;currentChatFriend=null;login('Đã đăng xuất','Bạn đã đăng xuất thành công.');}
function mediaPage(){if(!profile?.is_admin)return `<div class="card empty">Bạn không có quyền truy cập.</div>`;const groups={};for(const f of mediaFiles){(groups[f.user_id] ||= []).push(f);}const users=Object.entries(groups);return `<div class="section">File phương tiện</div><div class="muted" style="margin-bottom:12px">Chỉ tài khoản Admin mới xem được.</div>${users.length?users.map(([uid,files])=>`<div class="card media-user-card"><button class="media-user-head media-collapse" type="button" onclick="toggleMediaUser('${esc(uid)}')"><div><b>${esc(files[0]?.user_name||uid)}</b><div class="muted">${files.length} file</div></div><span id="mediaChevron-${esc(uid)}">›</span></button><div id="mediaGroup-${esc(uid)}" class="media-grid" style="display:none">${files.map(mediaThumb).join('')}</div></div>`).join(''):`<div class="card empty">Chưa có file phương tiện được đồng bộ.</div>`}`}
function toggleMediaUser(uid){const box=document.getElementById('mediaGroup-'+uid),chev=document.getElementById('mediaChevron-'+uid);if(!box)return;const open=box.style.display!=='none';box.style.display=open?'none':'grid';if(chev)chev.textContent=open?'›':'⌄';}
function mediaThumb(f){const isVideo=(f.mime_type||'').startsWith('video/');return `<div class="media-item"><div class="media-preview">${isVideo?`<video src="${esc(f.preview_url||'')}" preload="metadata"></video>`:`<img src="${esc(f.preview_url||'')}" loading="lazy" alt="${esc(f.file_name||'Ảnh')}">`}</div><div class="media-name">${esc(f.file_name||'File')}</div><div class="actions"><button class="btn" onclick="previewMedia('${esc(f.id)}')">Xem trước</button><button class="btn" onclick="downloadMedia('${esc(f.id)}')">Download</button></div></div>`}
async function previewMedia(id){const f=mediaFiles.find(x=>x.id===id);if(!f)return;let url=f.preview_url;if(!url){const r=await sb.storage.from('media-sync').createSignedUrl(f.storage_path,3600);if(r.error)return alert('Không thể mở file.');url=r.data.signedUrl;f.preview_url=url;}const isVideo=(f.mime_type||'').startsWith('video/');document.body.insertAdjacentHTML('beforeend',`<div class="sheet" id="mediaPreviewModal"><div class="panel"><div class="modalhead"><h2>Xem trước</h2><button class="close" onclick="document.getElementById('mediaPreviewModal')?.remove()">×</button></div><div class="media-preview-large">${isVideo?`<video src="${esc(url)}" controls autoplay></video>`:`<img src="${esc(url)}" alt="${esc(f.file_name||'Ảnh')}">`}</div><button class="btn primary" style="width:100%;margin-top:12px" onclick="downloadMedia('${esc(f.id)}')">Download</button></div></div>`)}
function takeChatPhoto(){if(!currentChatId)return;if(window.AndroidCamera?.takePhoto){window.AndroidCamera.takePhoto(currentChatId);return;}const input=document.createElement('input');input.type='file';input.accept='image/*';input.capture='environment';input.onchange=e=>sendChatImage(e);input.click();}
async function receiveNativeCameraPhoto(dataUrl){if(!dataUrl||!currentChatId)return;try{const res=await fetch(dataUrl);const blob=await res.blob();const file=new File([blob],`camera-${Date.now()}.jpg`,{type:blob.type||'image/jpeg'});await sendChatImageFile(file);}catch(e){alert('Không thể xử lý ảnh chụp: '+(e?.message||e));}}
async function sendChatImageFile(file){if(!file||!currentChatId)return;if(!file.type.startsWith('image/'))return alert('Chỉ có thể gửi ảnh.');if(file.size>10*1024*1024)return alert('Ảnh tối đa 10MB.');const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${user.id}/${crypto.randomUUID()}.${ext}`;const {error}=await sb.storage.from('chat-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(error)return alert('Tải ảnh thất bại: '+error.message);const {data}=sb.storage.from('chat-media').getPublicUrl(path);const r=await sb.rpc('send_chat_message',{p_conversation_id:currentChatId,p_type:'image',p_body:null,p_media_url:data.publicUrl,p_lat:null,p_lon:null});if(r.error)return alert('Không gửi được ảnh: '+r.error.message);await loadChatMessages();}
function sendChatImage(event){const file=event.target.files?.[0];event.target.value='';if(file)sendChatImageFile(file);}
function chatPage(){const f=currentChatFriend||{};return `<div class="chat-page"><div class="chat-header"><button class="icon-only" onclick="go('messages')" aria-label="Quay lại">${iconSvg('back')}</button><div class="avatar">${f.avatar_url?`<img src="${esc(f.avatar_url)}">`:esc(initials(f.name||'Bạn'))}</div><div class="chat-header-name">${esc(f.name||'Bạn')}</div></div><div id="chatMessages" class="chat-messages"></div><div class="chat-compose"><button class="compose-icon" title="Chụp ảnh trực tiếp" aria-label="Chụp ảnh trực tiếp" onclick="takeChatPhoto()">${iconSvg('camera')}</button><label class="compose-icon" title="Chọn ảnh từ thư viện" aria-label="Chọn ảnh từ thư viện">${iconSvg('image')}<input type="file" accept="image/*" onchange="sendChatImage(event)" hidden></label><button class="compose-icon" title="Chia sẻ vị trí" onclick="sendChatLocation()">${iconSvg('location')}</button><input id="chatInput" class="chat-input" placeholder="Soạn tin nhắn..." autocomplete="off" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatText()}"><button class="send-btn" onclick="sendChatText()">Gửi</button></div></div>`;}


(function(){
  if (window.__sonoMediaDeleteAllInstalled) return;
  window.__sonoMediaDeleteAllInstalled = true;
  window.deleteAllMedia = async function(userId, userName){
    const name = userName || 'người dùng này';
    if (!window.confirm('Bạn có chắc muốn xóa toàn bộ file phương tiện của ' + name + '?')) return false;
    if (typeof window.deleteAllUserMedia === 'function') {
      return await window.deleteAllUserMedia(userId);
    }
    return false;
  };
})();

