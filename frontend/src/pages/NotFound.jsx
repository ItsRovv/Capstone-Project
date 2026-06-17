import { Link } from 'react-router-dom';
import { Button } from '../components/UI/Button';
import { Icon } from '../components/Icon';

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream p-6">
      <div className="text-center max-w-md animate-slide-up">
        <div className="w-20 h-20 rounded-2xl bg-primary-100 text-primary-600 inline-flex items-center justify-center mb-6">
          <Icon.Heart width={32} height={32} />
        </div>
        <h1 className="text-5xl font-display font-bold text-ink-900 mb-2">404</h1>
        <p className="text-ink-700 font-medium mb-1">Page not found</p>
        <p className="text-sm text-ink-500 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/">
          <Button>Go to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
