import Head from "next/head";

const C = {
  bg: "#FAF6F1",
  brown: "#49372A",
  brownMuted: "#8B7355",
};
const font = "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif";

export default function Success() {
  return (
    <>
      <Head>
        <title>Payment Confirmed – Roomo</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          fontFamily: font,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <div
          style={{ fontSize: 22, fontWeight: 800, color: C.brown, marginBottom: 8 }}
        >
          You're all set!
        </div>
        <div
          style={{ fontSize: 14, color: C.brownMuted, lineHeight: 1.6, maxWidth: 300 }}
        >
          Your deposit has been received. We'll send a confirmation email with all the details shortly.
          <br /><br />
          Welcome to Roomo!
        </div>
      </div>
    </>
  );
}
