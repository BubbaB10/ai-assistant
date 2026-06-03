import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Planner — Your AI Chief of Staff',
  description: 'Text it like a friend. Get real answers about your money, your week, and your life — instantly.',
  keywords: ['AI assistant', 'personal finance', 'SMS assistant', 'budget tracker'],
  openGraph: {
    title: 'Planner — Your AI Chief of Staff',
    description: 'Text it like a friend. Get real answers about your money instantly.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
