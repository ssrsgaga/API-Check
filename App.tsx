import React, { useState, useEffect } from 'react';
import { Landing } from './components/Landing';
import { Dashboard } from './components/Dashboard';

const App: React.FC = () => {
  const [hasEntered, setHasEntered] = useState(false);
  // Initialize Theme with immediate system detection
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('omni_theme') as 'light' | 'dark';
      if (savedTheme) return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('omni_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <>
      {!hasEntered ? (
        <Landing onEnter={() => setHasEntered(true)} />
      ) : (
        <Dashboard toggleTheme={toggleTheme} isDark={theme === 'dark'} />
      )}
    </>
  );
};

export default App;