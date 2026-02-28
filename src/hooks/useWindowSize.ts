/**
 * Window size hook — tracks extension panel dimensions
 */

import { useState, useEffect } from 'react';

interface WindowSize {
  width: number;
  height: number;
  isNarrow: boolean;   // < 450px (typical side panel)
  isMedium: boolean;   // 450-768px
  isWide: boolean;     // > 768px
}

export function useWindowSize(): WindowSize {
  const [size, setSize] = useState<WindowSize>(() => getSize());

  useEffect(() => {
    const handleResize = () => {
      setSize(getSize());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

function getSize(): WindowSize {
  const width = window.innerWidth;
  const height = window.innerHeight;

  return {
    width,
    height,
    isNarrow: width < 450,
    isMedium: width >= 450 && width < 768,
    isWide: width >= 768,
  };
}