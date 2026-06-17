/**
 * JLMC Logo — renders the clinic's actual logo image.
 * Place the logo file at: frontend/public/jlmc-logo.png
 *
 * Usage: <JLMCLogo size={48} />
 */
export function JLMCLogo({ size = 36, className = '' }) {
  return (
    <img
      src="/jlmc-logo.jpg"
      alt="Jean Lying-in and Maternity Clinic logo"
      width={size}
      height={size}
      className={`object-contain rounded-full flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
