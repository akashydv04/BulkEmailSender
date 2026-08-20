import "./globals.css";

export const metadata = {
  title: "Email Sender Portal",
  description: "Production-ready email sending portal",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
