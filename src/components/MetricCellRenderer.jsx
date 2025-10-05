import { useEffect, useState, memo } from 'react';

export const MetricCellRenderer = memo((props) => {
  const [prevValue, setPrevValue] = useState(props.value);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    if (props.value !== prevValue && prevValue !== undefined) {
      setFlashClass('metric-changed');

      // Clear flash after very short animation (200ms)
      const timer = setTimeout(() => setFlashClass(''), 200);
      return () => clearTimeout(timer);
    }
    setPrevValue(props.value);
  }, [props.value]);

  return (
    <div className={flashClass}>
      {props.value?.toFixed(2) || '0.00'}
    </div>
  );
});
