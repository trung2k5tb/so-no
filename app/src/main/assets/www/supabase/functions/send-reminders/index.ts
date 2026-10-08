import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC,VAPID_PRIVATE);

const today = new Date();
today.setHours(0,0,0,0);
const iso=(d:Date)=>d.toISOString().slice(0,10);
const add=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};

const {data: debts,error} = await supabase.from("debts")
  .select("id,owner_id,type,person_name,institution,remaining,due_date")
  .gt("remaining",0).not("due_date","is",null);
if(error) throw error;

for(const d of debts||[]){
  const due=new Date(d.due_date+"T00:00:00");
  const diff=Math.round((due.getTime()-today.getTime())/86400000);
  const allowed=[7,3,1,0,-1];
  if(!allowed.includes(diff)) continue;

  const day=diff>=0?diff:-1;
  const target=d.due_date;
  const {data: ev}=await supabase.from("reminder_events")
    .select("id").eq("user_id",d.owner_id).eq("debt_id",d.id)
    .eq("reminder_day",day).eq("target_date",target).maybeSingle();
  if(ev) continue;

  const who=d.person_name||d.institution||"khoản nợ";
  const title=diff<0?"Khoản nợ đã quá hạn":"Nhắc hạn thanh toán";
  const body=diff===0?`${who} đến hạn hôm nay. Còn ${Number(d.remaining).toLocaleString("vi-VN")}đ.`
    :diff<0?`${who} đã quá hạn. Còn ${Number(d.remaining).toLocaleString("vi-VN")}đ.`
    :`${who} sẽ đến hạn sau ${diff} ngày. Còn ${Number(d.remaining).toLocaleString("vi-VN")}đ.`;

  const {data: subs}=await supabase.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id",d.owner_id);
  for(const s of subs||[]){
    try{
      await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},
        JSON.stringify({title,body,url:"/"}));
    }catch(_){}
  }
  await supabase.from("reminder_events").insert({user_id:d.owner_id,debt_id:d.id,reminder_day:day,target_date:target,sent_at:new Date().toISOString()});
}
return new Response("ok");
