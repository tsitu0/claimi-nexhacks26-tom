import "./globals.css";

export const metadata = {
  title: "Claimi",
  description: "Find money you are owed and claim it in minutes.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0B0F1A] text-[#E5E7EB] antialiased">
        {children}
      </body>
    </html>
  );
}
