import { useEffect, useState } from "react";
import { trpc } from "../../trpc";

interface CountdownTimerProps {
  itemId: string;
}

export function CountdownTimer({ itemId }: CountdownTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const { data } = trpc.requests.getDiscoveredDetails.useQuery(
    { itemId },
    { refetchInterval: 1000 }
  );

  useEffect(() => {
    if (data?.remainingSeconds !== undefined) {
      setRemainingSeconds(data.remainingSeconds);
    }
  }, [data]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  if (remainingSeconds <= 0) {
    return <span className="text-xs text-white/40">Processing...</span>;
  }

  return (
    <span className="text-xs text-white/60">
      Auto-download in {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}
