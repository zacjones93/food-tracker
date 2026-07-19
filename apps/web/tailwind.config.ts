import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react"

// TODO: Upgrade to Tailwind V4 and move all of this to global.css
const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
  	extend: {
  		fontFamily: {
  			sans: ['var(--font-raleway)', 'sans-serif'],
  			heading: ['var(--font-rosarivo)', 'serif']
  		},
  		backgroundImage: {
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  			'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
  			'mystic-gradient': 'linear-gradient(135deg, #4A3B5C 0%, #2D1F3D 100%)',
  			'mystic-gradient-soft': 'linear-gradient(135deg, #7A6491 0%, #574265 100%)',
  			'cream-gradient': 'linear-gradient(135deg, #F5EFE6 0%, #EDE4D3 100%)',
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			mystic: {
  				50: '#F5F3F7',
  				100: '#EBE7EF',
  				200: '#D7CFE0',
  				300: '#B8A9C9',
  				400: '#9784AD',
  				500: '#7A6491',
  				600: '#6B4E71',
  				700: '#574265',
  				800: '#4A3B5C',
  				900: '#2D1F3D',
  				950: '#1A1125',
  			},
  			cream: {
  				50: '#FEFBF6',
  				100: '#F5EFE6',
  				200: '#EDE4D3',
  				300: '#E4D9C0',
  				400: '#D4C5B0',
  				500: '#C4B5A0',
  				600: '#A89679',
  				700: '#8C7A5E',
  				800: '#6F5F47',
  				900: '#504435',
  			},
  			lavender: {
  				light: '#B8A9C9',
  				DEFAULT: '#8B7B99',
  				dark: '#6B5D7A',
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		boxShadow: {
  			'mystic-sm': '0 1px 2px 0 rgba(74, 59, 92, 0.05)',
  			'mystic': '0 4px 6px -1px rgba(74, 59, 92, 0.1), 0 2px 4px -1px rgba(74, 59, 92, 0.06)',
  			'mystic-md': '0 10px 15px -3px rgba(74, 59, 92, 0.1), 0 4px 6px -2px rgba(74, 59, 92, 0.05)',
  			'mystic-lg': '0 20px 25px -5px rgba(74, 59, 92, 0.1), 0 10px 10px -5px rgba(74, 59, 92, 0.04)',
  			'mystic-xl': '0 25px 50px -12px rgba(74, 59, 92, 0.25)',
  			'cream': '0 4px 6px -1px rgba(196, 181, 160, 0.1), 0 2px 4px -1px rgba(196, 181, 160, 0.06)',
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			shimmer: {
  				'0%': { transform: 'translateX(-100%)' },
  				'100%': { transform: 'translateX(100%)' },
  			},
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			shimmer: 'shimmer 2s infinite',
  		}
  	}
  },
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@tailwindcss/typography'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("tailwindcss-animate"),
    heroui(),
  ],
};
export default config;
