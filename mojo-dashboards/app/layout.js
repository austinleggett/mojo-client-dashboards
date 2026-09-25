import "./globals.css";

export const metadata = {
  title: "Mountain Mojo Client Dashboards",
  description: "Monthly marketing updates for Mountain Mojo Group clients.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
