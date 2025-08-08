import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function App() {
  const [session, setSession] = useState(null);
  const [notes, setNotes] = useState([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => authSub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadNotes();

    // 실시간 구독
    const channel = supabase
      .channel("realtime:notes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${session.user.id}` },
        (_payload) => loadNotes()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [session]);

  async function loadNotes() {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .order("inserted_at", { ascending: false });
    if (!error) setNotes(data ?? []);
  }

  async function addNote() {
    const trimmed = value.trim();
    if (!trimmed) return;

    const { data, error } = await supabase.from("notes").insert({
      user_id: session.user.id,
      content: trimmed,
    }).select();

    if (!error && data) {
      setNotes((prev) => [data[0], ...prev]);
      setValue("");
    }
  }

  async function deleteNote(id) {
    const before = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));

    const { error } = await supabase.from("notes").delete().eq("id", id);

    if (error) {
      setNotes(before);
      alert("삭제 실패: " + error.message);
    }
  }

  async function signIn() {
    // 가장 간단: GitHub/OAuth 버튼을 쓰거나
    // 이메일 매직링크
    const email = prompt("이메일 입력 (매직링크 전송)");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (!error) alert("메일 확인해서 로그인하세요!");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (!session)
    return (
      <div style={{ padding: 24 }}>
        <h2>Supabase Notes</h2>
        <button onClick={signIn}>이메일로 로그인</button>
      </div>
    );

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>안녕하세요, {session.user.email}</h2>
        <button onClick={signOut}>로그아웃</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="노트 입력 후 Enter"
          onKeyDown={(e) => e.key === "Enter" && addNote()}
          style={{ width: "100%", padding: 8 }}
        />
        <button onClick={addNote} style={{ marginTop: 8 }}>추가</button>
      </div>

      <ul style={{ marginTop: 16 }}>
        {notes.map((n) => (
          <li key={n.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
            <span>{n.content}</span>
            <button onClick={() => deleteNote(n.id)}>삭제</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
