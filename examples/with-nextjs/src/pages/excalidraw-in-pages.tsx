export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at top, rgba(56,189,248,0.18), transparent 35%), #04101c",
        color: "#f8fafc",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>
          App Router Version Available
        </h1>
        <p style={{ marginBottom: "1rem", opacity: 0.75 }}>
          This workspace now uses the App Router implementation for the cloud
          editor flow.
        </p>
        <a href="/" style={{ color: "#7dd3fc" }}>
          Return to the dashboard
        </a>
      </div>
    </main>
  );
}
