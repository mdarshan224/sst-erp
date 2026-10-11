export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "70vh",
        padding: "12vh 8%",
        background: "#fafaf6",
        color: "#6a6e65",
      }}
    >
      <div
        style={{
          height: 16,
          width: 160,
          background: "#e8eadd",
          borderRadius: 8,
          marginBottom: 30,
        }}
      />
      <div
        style={{
          height: 70,
          maxWidth: 680,
          background: "#e8eadd",
          borderRadius: 12,
          marginBottom: 22,
        }}
      />
      <div
        style={{
          height: 20,
          maxWidth: 470,
          background: "#e8eadd",
          borderRadius: 8,
        }}
      />
      <p style={{ marginTop: 30 }}>Loading page…</p>
    </div>
  );
}
