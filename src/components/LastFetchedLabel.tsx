import {formatLastFetchedAt} from '../lib/connectionStatus';

interface LastFetchedLabelProps {
  value: Date | null;
}

function LastFetchedLabel({value}: LastFetchedLabelProps) {
  const formatted = formatLastFetchedAt(value);
  if (!formatted) return null;

  return (
    <span className="last-fetched-label" role="status">
      최근 조회 {formatted}
    </span>
  );
}

export default LastFetchedLabel;
