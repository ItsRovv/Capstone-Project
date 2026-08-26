import { useEffect, useState } from 'react';
import api from '../services/api';

export function DbStatusBanner() {
  const [isFailover, setIsFailover] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkDbMode() {
      try {
        const { data } = await api.get('/health');
        if (!cancelled) setIsFailover(data.dbMode === 'fallback');
      } catch {
        // If health check fails entirely, don't show the banner
      }
    }

    checkDbMode();
    const interval = setInterval(checkDbMode, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!isFailover) return null;

  return (
    <div className="bg-amber-500 text-white text-center text-sm py-2 px-4 font-medium print:hidden">
      ⚠ Backup database active — changes will sync automatically when connection is restored.
    </div>
  );
}
