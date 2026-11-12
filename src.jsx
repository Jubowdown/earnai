import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./style.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function App() {
  const [page, setPage] = useState(location.hash === "#admin" ? "admin" : "chat");
  const [session, setSession] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [earnings, setEarnings] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState("");
  const bottom = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || page !== "chat") return;
    let alive = true;
    (async () => {
      let { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        const { data, error: e } = await supabase.auth.signInAnonymously();
        if (e) { setError(e.message); return; }
        s = { session: data.session };
      }
      if (!alive) return;
      setSession(s.session);
      const { data: existing, error: findErr } = await supabase.from("conversations").select("*").eq("owner_id", s.session.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (findErr) { setError(findErr.message); return; }
      let conv = existing;
      if (!conv) {
        const { data, error: createErr } = await supabase.from("conversations").insert({ owner_id: s.session.user.id }).select().single();
        if (createErr) { setError(createErr.message); return; }
        conv = data;
      }
      if (alive) { setConversation(conv); setEarnings(Number(conv.earnings || 0)); }
    })();
    return () => { alive = false; };
  }, [page]);

  const loadChat = async (id = conversation?.id) => {
    if (!supabase || !id) return;
    const [{ data: msgs, error: mErr }, { data: conv, error: cErr }, { data: settings }] = await Promise.all([
      supabase.from("messages").select("*").eq("conversation_id", id).order("created_at"),
      supabase.from("conversations").select("earnings").eq("id", id).single(),
      supabase.from("app_settings").select("reveal_enabled").eq("id", 1).maybeSingle()
    ]);
    if (!mErr && msgs) setMessages(msgs);
    if (!cErr && conv) setEarnings(Number(conv.earnings || 0));
    if (settings) setReveal(!!settings.reveal_enabled);
  };

  useEffect(() => {
    if (!conversation || page !== "chat") return;
    loadChat(conversation.id);
    const timer = setInterval(() => loadChat(conversation.id), 2200);
    return () => clearInterval(timer);
  }, [conversation, page]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !conversation || busy) return;
    setBusy(true); setError(""); setText("");
    const { error: e2 } = await supabase.from("messages").insert({ conversation_id: conversation.id, sender: "visitor", body });
    if (e2) { setText(body); setError(e2.message); }
    else await loadChat(conversation.id);
    setBusy(false);
  };

  const adminLogin = async (e) => {
    e.preventDefault(); setError("");
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    if (e2) setError(e2.message);
    else { setSession((await supabase.auth.getSession()).data.session); await loadAdmin(); }
  };

  const isAdmin = session?.user?.app_metadata?.role === "admin";
  const loadAdmin = async () => {
    const { data, error: e } = await supabase.from("conversations").select("*").order("created_at", { ascending: false });
    if (e) setError(e.message); else { setThreads(data || []); if (!selected && data?.length) setSelected(data[0].id); }
    const { data: st } = await supabase.from("app_settings").select("reveal_enabled").eq("id", 1).maybeSingle();
    if (st) setReveal(!!st.reveal_enabled);
  };

  useEffect(() => {
    if (page !== "admin" || !isAdmin) return;
    loadAdmin();
    const timer = setInterval(loadAdmin, 3000);
    return () => clearInterval(timer);
  }, [page, isAdmin]);

  useEffect(() => {
    if (page === "admin" && isAdmin && selected) {
      loadChat(selected);
      const timer = setInterval(() => loadChat(selected), 2200);
      return () => clearInterval(timer);
    }
  }, [page, isAdmin, selected]);

  const adminReply = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !selected) return;
    setBusy(true); setText("");
    const { error: e2 } = await supabase.from("messages").insert({ conversation_id: selected, sender: "admin", body });
    if (e2) { setText(body); setError(e2.message); }
    else await loadChat(selected);
    setBusy(false);
  };

  const toggleReveal = async () => {
    const next = !reveal;
    const { error: e } = await supabase.from("app_settings").update({ reveal_enabled: next }).eq("id", 1);
    if (e) setError(e.message); else setReveal(next);
  };

  if (!supabase) return <main className="setup"><h1>EarnAI setup</h1><p>Supabase configuration is missing. Add the project URL and publishable/anon key in Vercel Environment Variables.</p></main>;

  return <div className="app">
    <header className="top"><a className="brand" href="#"><span className="brandIcon">✳</span> EarnAI</a><nav><button className={page==="chat"?"nav active":"nav"} onClick={()=>{setPage("chat");location.hash="";}}>Chat</button><button className={page==="admin"?"nav active":"nav"} onClick={()=>{setPage("admin");location.hash="admin";setError("");}}>Admin</button></nav></header>
    {page === "chat" ? <main className="chatShell">
      <section className="balance"><div><small>তোমার ভার্চুয়াল আয়</small><div className="amount">৳ {earnings.toFixed(2)}</div><p>কথোপকথন চালিয়ে গেলে পয়েন্ট বাড়বে</p></div><span className="online">● Online</span></section>
      {reveal && <div className="reveal"><b>একটা সারপ্রাইজ! ❤️</b><p>এতক্ষণ AI নয়, ওপাশে একজন মানুষ তোমার মেসেজের উত্তর দিচ্ছিল। পুরো ব্যাপারটাই ছিল একটি মজার প্র্যাঙ্ক। এই ব্যালেন্স কাল্পনিক—বাস্তব টাকা নয়।</p></div>}
      <section className="messages"><div className="welcome"><div className="avatar">✳</div><h2>হ্যালো! 👋</h2><p>আমি তোমার AI chat assistant। তোমার যেকোনো প্রশ্ন করতে পারো।</p><small>চ্যাট চালিয়ে গেলে তোমার ভার্চুয়াল ব্যালেন্স বাড়বে।</small></div>
        {messages.map(m=><div key={m.id} className={"msg "+(m.sender==="visitor"?"mine":"theirs")}><div>{m.body}</div><time>{new Date(m.created_at).toLocaleTimeString("bn-BD",{hour:"2-digit",minute:"2-digit"})}</time></div>)}
        <div ref={bottom}/></section>
      <form className="composer" onSubmit={send}><input value={text} onChange={e=>setText(e.target.value)} placeholder="এখানে মেসেজ লেখো..." /><button disabled={busy || !text.trim()}>➤</button></form>
      <p className="footnote">EarnAI · Virtual points only</p>
    </main> : <main className="adminShell">
      {!isAdmin ? <form className="login card" onSubmit={adminLogin}><div className="avatar">⌘</div><h1>Admin Login</h1><p>শুধু ওয়েবসাইট পরিচালকের জন্য</p><input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="primary">Login</button></form> :
      <div className="adminGrid"><aside className="threadList card"><h2>Conversations</h2>{threads.map(t=><button className={"thread "+(selected===t.id?"chosen":"")} key={t.id} onClick={()=>setSelected(t.id)}><b>{t.id.slice(0,8)}</b><small>৳ {Number(t.earnings).toFixed(2)}</small></button>)}</aside><section className="adminChat card"><div className="adminHead"><div><h2>Chat Control</h2><small>Visitor messages & replies</small></div><button className={reveal?"danger":"secondary"} onClick={toggleReveal}>Reveal: {reveal?"ON":"OFF"}</button></div><div className="messages adminMessages">{messages.map(m=><div key={m.id} className={"msg "+(m.sender==="visitor"?"theirs":"mine")}><div><b>{m.sender==="visitor"?"Moumita":"You"}:</b> {m.body}</div><time>{new Date(m.created_at).toLocaleTimeString()}</time></div>)}<div ref={bottom}/></div><form className="composer" onSubmit={adminReply}><input value={text} onChange={e=>setText(e.target.value)} placeholder="তোমার উত্তর লেখো..." /><button disabled={busy || !selected || !text.trim()}>➤</button></form></section></div>}
    </main>}
    {error && <div className="error" role="alert">{error}</div>}
  </div>;
}
createRoot(document.getElementById("root")).render(<App/>);