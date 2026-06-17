/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E6F7F8',
          100: '#BCEAED',
          200: '#8DD9DF',
          300: '#54C4CB',
          400: '#28B2BC',
          500: '#0C9DA4',
          600: '#0A8990',
          700: '#077079',
          800: '#045860',
          900: '#023D43'
        },
        cream: '#FAFBF8',
        sand: '#F4F1EA',
        ink: {
          50: '#F7FAFC',
          100: '#EDF2F7',
          200: '#E2E8F0',
          300: '#CBD5E0',
          400: '#A0AEC0',
          500: '#718096',
          600: '#4A5568',
          700: '#2D3748',
          800: '#1A202C',
          900: '#0F1419'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgba(15, 20, 25, 0.04), 0 1px 3px 0 rgba(15, 20, 25, 0.06)',
        card: '0 4px 12px -2px rgba(15, 20, 25, 0.06), 0 2px 6px -2px rgba(15, 20, 25, 0.04)',
        lift: '0 12px 28px -8px rgba(12, 157, 164, 0.20), 0 4px 10px -4px rgba(15, 20, 25, 0.08)',
        glow: '0 0 0 3px rgba(12, 157, 164, 0.18)'
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem'
      },
      transitionTimingFunction: {
        /* Smooth deceleration — best for most UI motion */
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        /* Slight overshoot — feels alive for modals / popovers */
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        /* Modal / popover entry: scale + subtle rise */
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      },
      animation: {
        'fade-in':  'fade-in  0.22s cubic-bezier(0.25, 1, 0.5, 1)',
        'slide-up': 'slide-up 0.32s cubic-bezier(0.25, 1, 0.5, 1)',
        'scale-in': 'scale-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1)',
        shimmer:    'shimmer  1.6s linear infinite'
      }
    }
  },
  plugins: []
};
