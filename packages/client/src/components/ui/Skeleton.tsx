interface SkeletonProps {
  count?: number;
  className?: string;
  children?: React.ReactNode;
}

export function Skeleton({ count = 1, className = "", children }: SkeletonProps) {
  if (children) {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton loader array
          <div key={`skeleton-${i}`}>{children}</div>
        ))}
      </>
    );
  }

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton loader array
        <div key={`skeleton-${i}`} className={`bg-white/5 rounded animate-pulse ${className}`} />
      ))}
    </>
  );
}
