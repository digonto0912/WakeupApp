import { useState, useEffect } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs,
  deleteDoc, doc, query, orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAIceqMXYNY5EH_3vTmIbogjb6wJ2CCBxQ",
  authDomain: "speakup-27de0.firebaseapp.com",
  projectId: "speakup-27de0",
  storageBucket: "speakup-27de0.firebasestorage.app",
  messagingSenderId: "811108429557",
  appId: "1:811108429557:web:1ad8de2151de43b8f8dfbc",
  measurementId: "G-BQ65T23S3M",
};
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);
const COL   = "wakeup_logs";
const SCOL  = "sleep_logs";

const fmt  = d => new Date(d).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true});
const fmtD = d => new Date(d).toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const fmtS = d => new Date(d).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});

function durLabel(ms) {
  if (!ms || ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getCategory(h) {
  if (h < 5)  return { label:"Late Night 🌙", color:"#6d28d9" };
  if (h < 12) return { label:"Morning ☀️",    color:"#b45309" };
  if (h < 17) return { label:"Afternoon 🌞",  color:"#0369a1" };
  if (h < 20) return { label:"Evening 🌆",    color:"#7c3aed" };
  return               { label:"Late Night 🌙",color:"#1e1b4b" };
}

function getSky(h) {
  if (h < 5)  return ["#0f0c29","#302b63","#24243e"];
  if (h < 7)  return ["#1a1a3e","#9333ea","#f97316"];
  if (h < 9)  return ["#fcd34d","#f97316","#fef3c7"];
  if (h < 17) return ["#0ea5e9","#38bdf8","#bae6fd"];
  if (h < 20) return ["#f97316","#9333ea","#1e1b4b"];
  return               ["#0f0c29","#302b63","#0f0c29"];
}

function Sun() {
  const cx=50,cy=50,r=19,rayInner=24,rayOuter=43;
  const rays = Array.from({length:12},(_,i)=>{
    const a=(i*30-90)*(Math.PI/180);
    return { x1:cx+rayInner*Math.cos(a), y1:cy+rayInner*Math.sin(a), x2:cx+rayOuter*Math.cos(a), y2:cy+rayOuter*Math.sin(a) };
  });
  return (
    <svg viewBox="0 0 100 100" width="90" height="90" style={{display:"block",animation:"sunSpin 14s linear infinite"}}>
      <circle cx={cx} cy={cy} r={38} fill="#fbbf24" opacity="0.12"/>
      {rays.map((r,i)=><line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke="#fbbf24" strokeWidth="3.5" strokeLinecap="round"/>)}
      <circle cx={cx} cy={cy} r={r} fill="url(#sg)"/>
      <circle cx={cx-5} cy={cy-5} r={6} fill="#fef9c3" opacity="0.55"/>
      <defs><radialGradient id="sg" cx="38%" cy="33%" r="65%"><stop offset="0%" stopColor="#fef08a"/><stop offset="100%" stopColor="#f59e0b"/></radialGradient></defs>
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 100 100" width="90" height="90" style={{display:"block"}}>
      <circle cx="50" cy="50" r="36" fill="#94a3b8" opacity="0.12"/>
      <circle cx="50" cy="50" r="22" fill="url(#mg)"/>
      <circle cx="63" cy="37" r="22" fill="#302b63"/>
      <circle cx="40" cy="38" r="3.5" fill="white" opacity="0.25"/>
      <defs><radialGradient id="mg" cx="35%" cy="35%" r="65%"><stop offset="0%" stopColor="#e2e8f0"/><stop offset="100%" stopColor="#64748b"/></radialGradient></defs>
    </svg>
  );
}

export default function App() {
  const [wakeLogs,  setWakeLogs]  = useState([]);
  const [sleepLogs, setSleepLogs] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toastMsg,  setToastMsg]  = useState(null);
  const [now,       setNow]       = useState(new Date());
  const [pulse,     setPulse]     = useState(false);
  const [showHist,  setShowHist]  = useState(false);

  useEffect(()=>{ const t=setInterval(()=>setNow(new Date()),1000); return()=>clearInterval(t); },[]);

  useEffect(()=>{
    (async()=>{
      try {
        const [wSnap,sSnap] = await Promise.all([
          getDocs(query(collection(db,COL), orderBy("timestamp","desc"))),
          getDocs(query(collection(db,SCOL),orderBy("timestamp","desc"))),
        ]);
        setWakeLogs(wSnap.docs.map(d=>({id:d.id,...d.data()})));
        setSleepLogs(sSnap.docs.map(d=>({id:d.id,...d.data()})));
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    })();
  },[]);

  const todayStr    = now.toDateString();
  const alreadyWoke = wakeLogs.some(l=>new Date(l.timestamp).toDateString()===todayStr);
  const alreadySlept= sleepLogs.some(l=>new Date(l.timestamp).toDateString()===todayStr);

  function toast(msg) { setToastMsg(msg); setTimeout(()=>setToastMsg(null),2500); }

  async function handleWakeUp() {
    if (alreadyWoke||saving) return;
    setPulse(true); setSaving(true);
    try {
      const entry={timestamp:now.toISOString()};
      const ref=await addDoc(collection(db,COL),entry);
      setWakeLogs(p=>[{id:ref.id,...entry},...p]);
      toast("🌟 Good morning! Wake-up saved!");
      setTimeout(()=>setPulse(false),1500);
    } catch(e){ console.error(e); setPulse(false); }
    finally { setSaving(false); }
  }

  async function handleSleep() {
    if (alreadySlept||saving) return;
    setSaving(true);
    try {
      const entry={timestamp:now.toISOString()};
      const ref=await addDoc(collection(db,SCOL),entry);
      setSleepLogs(p=>[{id:ref.id,...entry},...p]);
      toast("🌙 Sleep time saved. Good night!");
    } catch(e){ console.error(e); }
    finally { setSaving(false); }
  }

  async function deleteWake(id) {
    try { await deleteDoc(doc(db,COL,id)); setWakeLogs(p=>p.filter(l=>l.id!==id)); } catch(e){}
  }
  async function deleteSleep(id) {
    try { await deleteDoc(doc(db,SCOL,id)); setSleepLogs(p=>p.filter(l=>l.id!==id)); } catch(e){}
  }

  const h = now.getHours();
  const isDay = h>=6&&h<20;
  const category = getCategory(h);
  const [c1,c2,c3] = getSky(h);

  // Stats
  const avgWakeH = wakeLogs.length
    ? Math.round(wakeLogs.reduce((a,l)=>a+new Date(l.timestamp).getHours(),0)/wakeLogs.length) : null;
  const avgWakeLabel = avgWakeH!=null
    ? `${avgWakeH>12?avgWakeH-12:avgWakeH||12}${avgWakeH>=12?"pm":"am"}` : "—";

  // Average sleep duration
  const sleepDurations = wakeLogs.map(w=>{
    const wDate = new Date(w.timestamp);
    // find sleep log from the night before (within 18h before wake)
    const match = sleepLogs.find(s=>{
      const sDate=new Date(s.timestamp);
      const diff = wDate-sDate;
      return diff>0 && diff<18*3600*1000;
    });
    return match ? wDate-new Date(match.timestamp) : null;
  }).filter(Boolean);
  const avgSleepLabel = sleepDurations.length
    ? durLabel(sleepDurations.reduce((a,b)=>a+b,0)/sleepDurations.length) : "—";

  const streak = (()=>{
    if(!wakeLogs.length) return 0;
    let n=0; const today=new Date(); today.setHours(0,0,0,0);
    for(let i=0;i<60;i++){
      const d=new Date(today); d.setDate(d.getDate()-i);
      if(wakeLogs.some(l=>new Date(l.timestamp).toDateString()===d.toDateString())) n++;
      else if(i>0) break;
    }
    return n;
  })();

  // Build merged history rows (by date)
  const historyDates = [...new Set([
    ...wakeLogs.map(l=>new Date(l.timestamp).toDateString()),
    ...sleepLogs.map(l=>new Date(l.timestamp).toDateString()),
  ])].sort((a,b)=>new Date(b)-new Date(a));

  return (
    <div style={{
      minHeight:"100vh",
      background:`linear-gradient(170deg,${c1} 0%,${c2} 55%,${c3} 100%)`,
      fontFamily:"Georgia,serif",
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"32px 16px 40px",
      transition:"background 3s ease",
      position:"relative", overflow:"hidden",
    }}>
      <style>{`
        @keyframes sunSpin   {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes ripple    {0%{transform:scale(1);opacity:.45}100%{transform:scale(2.8);opacity:0}}
        @keyframes bounceIn  {0%{transform:scale(.4);opacity:0}60%{transform:scale(1.07)}100%{transform:scale(1);opacity:1}}
        @keyframes floatBob  {0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        @keyframes fadeSlide {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin      {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes twinkle   {0%,100%{opacity:.12}50%{opacity:.85}}
      `}</style>

      {!isDay && Array.from({length:30}).map((_,i)=>(
        <div key={i} style={{
          position:"fixed", borderRadius:"50%", background:"white", pointerEvents:"none",
          width:(Math.random()*2+1)+"px", height:(Math.random()*2+1)+"px",
          left:Math.random()*100+"%", top:Math.random()*55+"%",
          animation:`twinkle ${(Math.random()*3+2).toFixed(1)}s ease-in-out infinite`,
          animationDelay:`${(Math.random()*2).toFixed(1)}s`,
        }}/>
      ))}

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position:"fixed", top:24, left:"50%", transform:"translateX(-50%)",
          background:"rgba(0,0,0,.55)", backdropFilter:"blur(14px)",
          border:"1px solid rgba(255,255,255,.25)", borderRadius:20,
          padding:"12px 28px", color:"#fff", fontWeight:"bold", fontSize:15,
          animation:"bounceIn .4s ease-out", zIndex:999, whiteSpace:"nowrap",
          boxShadow:"0 8px 24px rgba(0,0,0,.4)",
        }}>
          {toastMsg}
        </div>
      )}

      {/* Sun / Moon */}
      <div style={{ animation:"floatBob 4s ease-in-out infinite", marginBottom:4 }}>
        {isDay ? <Sun/> : <Moon/>}
      </div>

      {/* Time */}
      <div style={{
        color:"#fff", fontSize:"clamp(40px,11vw,70px)", fontWeight:"bold",
        letterSpacing:3, textShadow:"0 2px 24px rgba(0,0,0,.55)",
        lineHeight:1, marginBottom:6,
      }}>
        {fmt(now)}
      </div>
      <div style={{
        color:"rgba(255,255,255,.88)", fontSize:"clamp(13px,3.5vw,17px)",
        marginBottom:10, textAlign:"center", textShadow:"0 1px 8px rgba(0,0,0,.4)",
      }}>
        {fmtD(now)}
      </div>
      <div style={{
        background:"rgba(0,0,0,.28)", color:"#fff", borderRadius:24,
        padding:"5px 18px", fontSize:13, fontWeight:"bold", letterSpacing:.5,
        marginBottom:32, border:"1px solid rgba(255,255,255,.22)",
        backdropFilter:"blur(6px)",
      }}>
        {category.label}
      </div>

      {/* Wake-Up Button (main) */}
      <div style={{ position:"relative", marginBottom:20 }}>
        {pulse && <>
          <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"#fbbf24",animation:"ripple 1s ease-out forwards"}}/>
          <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"#fbbf24",animation:"ripple 1.5s .2s ease-out forwards"}}/>
        </>}
        <button onClick={handleWakeUp} disabled={alreadyWoke||saving||loading} style={{
          width:168, height:168, borderRadius:"50%", border:"none",
          cursor:(alreadyWoke||saving||loading)?"default":"pointer",
          background:alreadyWoke
            ?"radial-gradient(circle at 38% 35%,#86efac,#16a34a)"
            :"radial-gradient(circle at 38% 35%,#fef08a,#f59e0b 70%,#d97706)",
          boxShadow:alreadyWoke
            ?"0 0 0 5px rgba(34,197,94,.22),0 12px 36px rgba(0,0,0,.35)"
            :"0 0 0 5px rgba(251,191,36,.22),0 12px 36px rgba(0,0,0,.35)",
          transform:pulse?"scale(.94)":"scale(1)",
          transition:"transform .15s, box-shadow .3s",
          animation:(!alreadyWoke&&!loading)?"floatBob 3.5s ease-in-out infinite":"none",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          WebkitTapHighlightColor:"transparent", outline:"none",
        }}>
          {loading||saving ? (
            <div style={{width:34,height:34,border:"4px solid rgba(0,0,0,.18)",borderTopColor:"rgba(0,0,0,.55)",borderRadius:"50%",animation:"spin .75s linear infinite"}}/>
          ) : alreadyWoke ? (
            <>
              <div style={{fontSize:48,lineHeight:1}}>✅</div>
              <div style={{color:"#14532d",fontWeight:"bold",fontSize:13,marginTop:8,textAlign:"center",lineHeight:1.4}}>Logged Today!</div>
            </>
          ) : (
            <>
              <div style={{fontSize:48,lineHeight:1}}>☀️</div>
              <div style={{color:"#78350f",fontWeight:"bold",fontSize:15,marginTop:8}}>I'm Awake!</div>
            </>
          )}
        </button>
      </div>

      {/* Sleep button — subtle, small */}
      <button
        onClick={handleSleep}
        disabled={alreadySlept||saving||loading}
        style={{
          background: alreadySlept ? "rgba(99,102,241,.18)" : "rgba(0,0,0,.22)",
          border: alreadySlept ? "1px solid rgba(165,180,252,.35)" : "1px solid rgba(255,255,255,.18)",
          borderRadius:30,
          color: alreadySlept ? "rgba(199,210,254,.7)" : "rgba(255,255,255,.65)",
          padding:"9px 22px",
          fontSize:13,
          cursor:(alreadySlept||saving||loading)?"default":"pointer",
          backdropFilter:"blur(8px)",
          fontFamily:"Georgia,serif",
          letterSpacing:.3,
          marginBottom:32,
          transition:"all .2s",
          WebkitTapHighlightColor:"transparent",
          outline:"none",
          display:"flex", alignItems:"center", gap:7,
        }}
      >
        <span>🌙</span>
        <span>{alreadySlept ? "Sleep logged" : "Going to sleep"}</span>
      </button>

      {/* Stats */}
      <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap",justifyContent:"center"}}>
        {[
          {label:"Days",       value:loading?"…":wakeLogs.length, icon:"📅"},
          {label:"Streak",     value:loading?"…":`${streak}d`,    icon:"🔥"},
          {label:"Avg Wake",   value:loading?"…":avgWakeLabel,     icon:"⏰"},
          {label:"Avg Sleep",  value:loading?"…":avgSleepLabel,   icon:"💤"},
        ].map(s=>(
          <div key={s.label} style={{
            background:"rgba(0,0,0,.28)", backdropFilter:"blur(10px)",
            border:"1px solid rgba(255,255,255,.16)", borderRadius:16,
            padding:"12px 18px", textAlign:"center", minWidth:80,
          }}>
            <div style={{fontSize:22,marginBottom:3}}>{s.icon}</div>
            <div style={{color:"#fff",fontWeight:"bold",fontSize:20,textShadow:"0 1px 6px rgba(0,0,0,.4)"}}>{s.value}</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:10,marginTop:1}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* History toggle */}
      {(wakeLogs.length>0||sleepLogs.length>0) && (
        <button onClick={()=>setShowHist(!showHist)} style={{
          background:"rgba(0,0,0,.25)", backdropFilter:"blur(8px)",
          border:"1px solid rgba(255,255,255,.2)", borderRadius:14,
          color:"rgba(255,255,255,.8)", padding:"10px 26px", cursor:"pointer",
          fontSize:13, marginBottom:16, fontFamily:"Georgia,serif",
          WebkitTapHighlightColor:"transparent", outline:"none",
        }}>
          {showHist?"▲ Hide History":`▼ History (${wakeLogs.length} days)`}
        </button>
      )}

      {/* History */}
      {showHist && (
        <div style={{width:"100%",maxWidth:430,animation:"fadeSlide .3s ease-out"}}>
          {historyDates.map(dateStr=>{
            const wake  = wakeLogs.find(l=>new Date(l.timestamp).toDateString()===dateStr);
            const sleep = sleepLogs.find(l=>new Date(l.timestamp).toDateString()===dateStr);
            // calc sleep duration for this wake entry
            let dur = null;
            if (wake && sleep) {
              const wDate=new Date(wake.timestamp), sDate=new Date(sleep.timestamp);
              const diff = wDate-sDate;
              if (diff>0 && diff<18*3600*1000) dur = durLabel(diff);
            }
            return (
              <div key={dateStr} style={{
                background:"rgba(0,0,0,.25)", backdropFilter:"blur(10px)",
                border:"1px solid rgba(255,255,255,.15)", borderRadius:16,
                padding:"13px 16px", marginBottom:10,
              }}>
                {/* Date header */}
                <div style={{color:"rgba(255,255,255,.55)",fontSize:12,marginBottom:10,letterSpacing:.5}}>
                  {new Date(dateStr).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
                </div>

                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {/* Wake row */}
                  {wake && (
                    <div style={{
                      flex:1, minWidth:120,
                      background:"rgba(251,191,36,.1)", border:"1px solid rgba(251,191,36,.2)",
                      borderRadius:12, padding:"9px 12px",
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                    }}>
                      <div>
                        <div style={{color:"rgba(255,255,255,.55)",fontSize:10,marginBottom:2}}>WOKE UP</div>
                        <div style={{color:"#fef08a",fontWeight:"bold",fontSize:15}}>{fmt(wake.timestamp)}</div>
                      </div>
                      <button onClick={()=>deleteWake(wake.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",fontSize:14,padding:"2px 4px"}}>✕</button>
                    </div>
                  )}

                  {/* Sleep row */}
                  {sleep && (
                    <div style={{
                      flex:1, minWidth:120,
                      background:"rgba(99,102,241,.1)", border:"1px solid rgba(165,180,252,.2)",
                      borderRadius:12, padding:"9px 12px",
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                    }}>
                      <div>
                        <div style={{color:"rgba(255,255,255,.55)",fontSize:10,marginBottom:2}}>SLEPT</div>
                        <div style={{color:"#c7d2fe",fontWeight:"bold",fontSize:15}}>{fmt(sleep.timestamp)}</div>
                      </div>
                      <button onClick={()=>deleteSleep(sleep.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",fontSize:14,padding:"2px 4px"}}>✕</button>
                    </div>
                  )}
                </div>

                {/* Duration */}
                {dur && (
                  <div style={{
                    marginTop:10, textAlign:"center",
                    color:"rgba(255,255,255,.5)", fontSize:12,
                    borderTop:"1px solid rgba(255,255,255,.08)", paddingTop:8,
                  }}>
                    💤 Slept for <span style={{color:"rgba(255,255,255,.8)",fontWeight:"bold"}}>{dur}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && wakeLogs.length===0 && (
        <div style={{color:"rgba(255,255,255,.5)",fontSize:14,textAlign:"center",marginTop:8,lineHeight:1.9}}>
          Tap the sun when you wake up.<br/>Tap the small button when you sleep.
        </div>
      )}
    </div>
  );
}
