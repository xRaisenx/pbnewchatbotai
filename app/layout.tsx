// app/layout.tsx
import './globals.css';
import { ThemeProvider } from '../providers/ThemeProvider';

export const metadata = {
  title: 'Planet Beauty Chatbot',
  description: 'AI-powered shopping assistant for Planet Beauty.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
