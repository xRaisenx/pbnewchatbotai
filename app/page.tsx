// app/page.tsx
'use client';
import { ChatInterface } from '../components/ChatInterface';
import { ThemeProvider } from '../providers/ThemeProvider';

export default function Home() {
  return (
    <ThemeProvider>
      <main className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center p-4">
        <ChatInterface />
      </main>
    </ThemeProvider>
  );
}
