import { useEffect, useState } from "react";

/**
 * Debug page to display your Better Auth session token
 * Visit: http://localhost:5173/debug/session
 */
export default function DebugSession() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [allCookies, setAllCookies] = useState<string>("");
  const [sessionData, setSessionData] = useState<unknown>(null);

  useEffect(() => {
    // Get all cookies
    const cookies = document.cookie;
    setAllCookies(cookies);

    // Extract better-auth.session_token
    const match = cookies.match(/better-auth\.session_token=([^;]+)/);
    if (match) {
      setSessionToken(match[1]);
    }

    // Fetch session data from API
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => setSessionData(data))
      .catch((err) => console.error("Failed to fetch session:", err));
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>🔐 Better Auth Session Debug</h1>

      <div style={{ marginTop: "2rem", padding: "1rem", background: "#f5f5f5", borderRadius: "8px" }}>
        <h2>Session Token</h2>
        {sessionToken ? (
          <>
            <div
              style={{
                padding: "1rem",
                background: "#fff",
                border: "2px solid #4CAF50",
                borderRadius: "4px",
                wordBreak: "break-all",
                marginBottom: "1rem",
              }}>
              <strong>✅ Found:</strong> {sessionToken}
            </div>
            <button
              onClick={() => copyToClipboard(sessionToken)}
              style={{
                padding: "0.5rem 1rem",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
              }}>
              📋 Copy Token
            </button>
          </>
        ) : (
          <div
            style={{
              padding: "1rem",
              background: "#fff3cd",
              border: "2px solid #ffc107",
              borderRadius: "4px",
            }}>
            <strong>⚠️ No session token found!</strong>
            <p>You need to log in first.</p>
            <a href="/" style={{ color: "#007bff" }}>
              Go to Home Page and Log In
            </a>
          </div>
        )}
      </div>

      <div style={{ marginTop: "2rem", padding: "1rem", background: "#f5f5f5", borderRadius: "8px" }}>
        <h2>Session Data</h2>
        <pre
          style={{
            padding: "1rem",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "4px",
            overflow: "auto",
          }}>
          {sessionData ? JSON.stringify(sessionData, null, 2) : "Loading..."}
        </pre>
      </div>

      <div style={{ marginTop: "2rem", padding: "1rem", background: "#f5f5f5", borderRadius: "8px" }}>
        <h2>All Cookies</h2>
        <pre
          style={{
            padding: "1rem",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "4px",
            overflow: "auto",
            wordBreak: "break-all",
          }}>
          {allCookies || "No cookies found"}
        </pre>
      </div>

      {sessionToken && (
        <div style={{ marginTop: "2rem", padding: "1rem", background: "#e3f2fd", borderRadius: "8px" }}>
          <h2>📋 Example API Calls</h2>
          <p>Use this token in your curl commands:</p>

          <div style={{ marginTop: "1rem" }}>
            <h3>List all scenes:</h3>
            <pre
              style={{
                padding: "1rem",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "4px",
                overflow: "auto",
              }}>
              {`curl -X GET "http://localhost:5173/api/scenes/c2f1278f-09bf-4efd-9fd0-7105506cafad" \\
  -H "Cookie: better-auth.session_token=${sessionToken}"`}
            </pre>
            <button
              onClick={() =>
                copyToClipboard(
                  `curl -X GET "http://localhost:5173/api/scenes/c2f1278f-09bf-4efd-9fd0-7105506cafad" -H "Cookie: better-auth.session_token=${sessionToken}"`,
                )
              }
              style={{
                padding: "0.5rem 1rem",
                background: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem",
                marginTop: "0.5rem",
              }}>
              📋 Copy Command
            </button>
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <h3>Get specific scene:</h3>
            <pre
              style={{
                padding: "1rem",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "4px",
                overflow: "auto",
              }}>
              {`curl -X GET "http://localhost:5173/api/scenes/c2f1278f-09bf-4efd-9fd0-7105506cafad/867937a7-26c5-4602-8848-3e1843f42194" \\
  -H "Cookie: better-auth.session_token=${sessionToken}"`}
            </pre>
            <button
              onClick={() =>
                copyToClipboard(
                  `curl -X GET "http://localhost:5173/api/scenes/c2f1278f-09bf-4efd-9fd0-7105506cafad/867937a7-26c5-4602-8848-3e1843f42194" -H "Cookie: better-auth.session_token=${sessionToken}"`,
                )
              }
              style={{
                padding: "0.5rem 1rem",
                background: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.9rem",
                marginTop: "0.5rem",
              }}>
              📋 Copy Command
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: "2rem", padding: "1rem", background: "#fff3cd", borderRadius: "8px" }}>
        <h2>📖 How to Use</h2>
        <ol>
          <li>Make sure you're logged in to the app</li>
          <li>Copy the session token above</li>
          <li>
            Use it in your curl commands with: <code>-H "Cookie: better-auth.session_token=YOUR_TOKEN"</code>
          </li>
        </ol>
      </div>
    </div>
  );
}
