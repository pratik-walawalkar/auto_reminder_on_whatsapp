/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // --- CENTRALIZED BRAND COLOR PALETTE ---
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        border: 'hsl(var(--border))',
        // Royal Blue Core Branding Variables
        royal: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#2563eb', // Primary Sapphire Blue Accent
          600: '#1d4ed8', // Dark Mode / Hover Sapphire Blue
          700: '#1d4ed8',
        }
      },
      // --- CENTRALIZED STRUCTURAL CORNER RADII ---
      borderRadius: {
        'sm': '8px',
        'md': '10px',
        'xl': '12px',   // Button / Input Standard
        '2xl': '16px',  // Component Card Standard
        '3xl': '24px',  // Drawer / Modal Wizard Standard
      },
      // --- CENTRALIZED CRISP TYPOGRAPHY OVERLAY MATRIX ---
      fontSize: {
        'dashboard-caption': ['14px', { lineHeight: '20px', fontWeight: '600' }],
        'dashboard-body': ['15px', { lineHeight: '22px', fontWeight: '600' }],
        'dashboard-card-title': ['13px', { lineHeight: '16px', fontWeight: '800', letterSpacing: '0.05em' }],
        'dashboard-title': ['18px', { lineHeight: '26px', fontWeight: '900' }],
        'dashboard-kpi': ['40px', { lineHeight: '1', fontWeight: '950', letterSpacing: '-0.02em' }],
        'dashboard-heading': ['36px', { lineHeight: '40px', fontWeight: '900', letterSpacing: '-0.03em' }],
      },
      // --- CENTRALIZED HARDWARE-ACCELERATED SHADOW GLOWS ---
      boxShadow: {
        'royal-panel': '0 4px 30px -2px rgba(0, 0, 0, 0.01), 0 0 50px 0 var(--royal-glow)',
        'royal-panel-hover': '0 12px 40px -4px rgba(0, 0, 0, 0.03), 0 0 60px 4px var(--royal-glow)',
        'ui-element': '0 2px 8px -1px rgba(0, 0, 0, 0.02), 0 0 20px 0 var(--royal-glow)',
      }
    },
  },
  plugins: [],
};
