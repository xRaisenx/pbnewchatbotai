// app/test-chat/page.tsx
'use client';
import React from 'react';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { ChatInterface } from '../../components/ChatInterface';

export default function TestChat() {
  return (
    <ThemeProvider>
      <main className="min-h-screen bg-white dark:bg-gray-900 p-4">
        <ChatInterface />
      </main>
    </ThemeProvider>
  );
}
