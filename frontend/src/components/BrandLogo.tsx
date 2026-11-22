import { useState } from "react";

export const DEFAULT_APP_LOGO = "/icons/siput-pkbm-logo.png";

export function BrandLogo({
  src,
  alt = "Logo SIPUT PKBM",
  className = "h-10 w-10 rounded-xl",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const [failedCustom, setFailedCustom] = useState(false);
  const resolvedSrc = src && !failedCustom ? src : DEFAULT_APP_LOGO;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => {
        if (src && !failedCustom) setFailedCustom(true);
      }}
      className={`shrink-0 object-cover shadow-sm ${className}`}
    />
  );
}
