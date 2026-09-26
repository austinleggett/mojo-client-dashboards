import "./globals.css";

export const metadata = {
  title: "Mountain Mojo Client Dashboards",
  description: "Monthly marketing updates for Mountain Mojo Group clients.",
};

// Runs before hydration so a saved light/dark choice applies to the
// very first paint -- without this, the page would render once with
// the system default and then visibly flash to the saved choice a
// moment later. Reads the same localStorage key useTheme() (lib/theme.js)
// writes to; "system" (or nothing saved yet) leaves no attribute at
// all, so app/globals.css's prefers-color-scheme media query alone
// decides, exactly as it did before this toggle existed.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("mojo-dashboard-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
