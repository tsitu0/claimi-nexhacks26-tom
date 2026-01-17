import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("loading");
  const [apiOk, setApiOk] = useState(false);
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5171";

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      try {
        const res = await fetch(`${apiUrl}/health`);
        const data = await res.json();
        setApiOk(Boolean(data?.ok));
        setStatus("ok");
      } catch {
        setStatus("error");
      }
    };
    load();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Claimi + Supabase</h1>
      {status === "loading" && <p>Loading...</p>}
      {status === "error" && <p>API not reachable.</p>}
      {status === "ok" && (
        <p>{apiOk ? "API OK" : "API responded, but not OK"}</p>
      )}
    </main>
  );
}
