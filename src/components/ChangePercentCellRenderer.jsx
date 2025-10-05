import { memo } from 'react';

export const ChangePercentCellRenderer = memo((props) => {
  const val = props.value || 0;
  const className = val >= 0 ? 'change-positive' : 'change-negative';
  const formatted = (val >= 0 ? '+' : '') + val.toFixed(2) + '%';

  return (
    <div className={className}>
      {formatted}
    </div>
  );
});
